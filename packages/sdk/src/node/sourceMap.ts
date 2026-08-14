import { closeSync, openSync, readFileSync, readSync, statSync } from 'node:fs'
import { SourceMap } from 'node:module'
import { dirname, resolve, sep } from 'node:path'

/**
 * Reading original source out of a build's own source map.
 *
 * This is the case that matters in a real deployment: the thing that shipped is
 * `dist/`, the original `.ts` files are on somebody's laptop, and a frame that
 * resolves to `src/UserRepository.ts` names a file that does not exist on the
 * machine that threw. The code is not gone, though — it is sitting in the map's
 * `sourcesContent`, next to the bundle, which is exactly the "non-public source
 * map to parse and extract" this is for. The map never leaves the server; only
 * the eleven lines that matter do.
 *
 * No VLQ decoder here. `node:module` has shipped a `SourceMap` class since Node
 * 13 that parses mappings and answers position queries, so the whole job is
 * finding the right map and indexing into an array. A hand-rolled decoder would
 * be a hundred lines of well-known algorithm to reimplement something already in
 * the runtime.
 */

/** Maps larger than this are skipped — a `sourcesContent` blob for a huge app. */
const MAX_MAP_BYTES = 32 * 1024 * 1024

/** How much of a bundle's tail is scanned for its `sourceMappingURL` comment. */
const TAIL_BYTES = 4096

export interface ResolvedPosition {
  /** The original file, as the map names it. */
  source: string
  /** 1-based, to match a stack frame. */
  line: number
  /** 1-based, to match a stack frame. */
  column: number
  /** The original source text, for slicing. */
  content: string
  /** The original function name, when the map recorded one. */
  name?: string
}

export interface LoadedMap {
  map: SourceMap
  sources: string[]
  sourcesContent: (string | null)[]
}

/**
 * Parsed maps, keyed by the generated file they belong to.
 *
 * Held by the caller so its lifetime matches the hook's, and so a `null` — a
 * build with no map at all — is remembered rather than re-probed on every event.
 */
export type SourceMapCache = Map<string, LoadedMap | null>

/**
 * Resolves a position in a generated file back to its original source.
 *
 * `line` and `column` are 1-based, as they arrive from a stack frame; Node's
 * `findEntry` is 0-based on both, and getting that conversion wrong shifts every
 * snippet by a line, which looks plausible and is wrong — the worst kind of bug
 * for this feature to have.
 *
 * Returns null for anything it cannot do confidently.
 */
export function resolveViaSourceMap(
  generatedPath: string,
  line: number,
  column: number,
  cache: SourceMapCache,
  confine?: string,
): ResolvedPosition | null {
  try {
    const loaded = loadMap(generatedPath, cache, confine)
    if (!loaded) return null

    // Typed as `{} | SourceMapping`, because a miss comes back as an empty
    // object rather than null — a generated column before the first mapping
    // legitimately has no original position. Reading it as a partial shape is
    // what that union actually means; the guard below is the narrowing.
    const entry = loaded.map.findEntry(line - 1, Math.max(0, column - 1)) as {
      originalSource?: string
      originalLine?: number
      originalColumn?: number
      name?: string
    }
    if (typeof entry.originalLine !== 'number') return null

    const content = contentFor(loaded, entry.originalSource)
    if (content === null) return null

    return {
      source: tidySourcePath(entry.originalSource ?? generatedPath),
      line: entry.originalLine + 1,
      column: (entry.originalColumn ?? 0) + 1,
      content,
      name: entry.name || undefined,
    }
  } catch {
    return null
  }
}

/**
 * A source path fit to display and to group on.
 *
 * Bundlers record sources relative to the *output* directory, or behind a
 * pseudo-protocol: esbuild writes `../src/a.ts`, webpack writes
 * `webpack://app/./src/a.ts`, and the number of `../` hops depends on where the
 * bundle happens to be written. Both are noise in a stack panel, and the second
 * problem is worse than cosmetic — grouping fingerprints on the filename, so
 * moving `dist/` one directory deeper would otherwise re-open every issue in the
 * project without a line of code having changed.
 *
 * Applied only to the value that leaves this module. `sourcesContent` is indexed
 * by the map's own untouched `sources` entry.
 */
function tidySourcePath(source: string): string {
  return source.replace(/^[a-z-]+:\/\/[^/]*\//i, '').replace(/^(?:\.\.?\/)+/, '')
}

/**
 * The embedded text for one of the map's sources.
 *
 * Matched by exact entry first, then by suffix: `originalSource` is normally the
 * `sources` entry verbatim, but Node resolves it against `sourceRoot` when the
 * map sets one, and then the two no longer compare equal.
 */
function contentFor(loaded: LoadedMap, originalSource: string | undefined): string | null {
  if (!originalSource) return null

  let index = loaded.sources.indexOf(originalSource)
  if (index === -1) {
    index = loaded.sources.findIndex((source) => source && originalSource.endsWith(source))
  }
  if (index === -1) return null

  const content = loaded.sourcesContent[index]
  // A map built without `sourcesContent` maps positions but carries no text.
  // The location is still right; there is simply nothing to quote.
  return typeof content === 'string' && content !== '' ? content : null
}

/** `null` is cached as well: a build with no map must not be re-probed per event. */
function loadMap(generatedPath: string, cache: SourceMapCache, confine?: string): LoadedMap | null {
  const hit = cache.get(generatedPath)
  if (hit !== undefined) return hit

  let loaded: LoadedMap | null = null
  try {
    const mapPath = findMapPath(generatedPath)
    // A `sourceMappingURL` comment is content, and when the caller took the
    // generated path from a browser it is content an attacker may control — so a
    // map reached that way can point anywhere, including out of the directory
    // the caller meant to expose. `confine` is how the symbolicate handler
    // refuses that; the in-process Node hook has no attacker and passes none.
    if (mapPath && confine && !isInside(mapPath, confine)) return cacheMiss(cache, generatedPath)
    if (mapPath && statSync(mapPath).size <= MAX_MAP_BYTES) {
      const payload = JSON.parse(readFileSync(mapPath, 'utf8')) as {
        sources?: unknown
        sourcesContent?: unknown
      }
      const sources = Array.isArray(payload.sources) ? (payload.sources as string[]) : []
      const sourcesContent = Array.isArray(payload.sourcesContent)
        ? (payload.sourcesContent as (string | null)[])
        : []

      // Index maps (`sections`) are a different shape that `SourceMap` handles
      // but `sources`/`sourcesContent` do not describe; with no content to
      // index, this falls out as a miss rather than a wrong answer.
      if (sources.length > 0) {
        loaded = { map: new SourceMap(payload as never), sources, sourcesContent }
      }
    }
  } catch {
    loaded = null
  }

  cache.set(generatedPath, loaded)
  return loaded
}

function cacheMiss(cache: SourceMapCache, key: string): null {
  cache.set(key, null)
  return null
}

/** True when `target` resolves inside `root` — separator included, so a sibling
 * directory sharing a name prefix does not pass. */
export function isInside(target: string, root: string): boolean {
  const base = resolve(root)
  const path = resolve(target)
  return path === base || path.startsWith(base.endsWith(sep) ? base : base + sep)
}

/**
 * Where the map for a generated file lives.
 *
 * `<file>.map` first, because that is what esbuild, tsc, webpack and rollup all
 * emit by default and it costs one `stat`. Only if that misses is the file's
 * tail read for a `sourceMappingURL` comment, which covers custom names.
 *
 * Inline `data:` maps are deliberately not supported: a base64 map is megabytes
 * appended to the bundle, so it is neither in the tail this reads nor something
 * worth parsing inside an error path.
 */
function findMapPath(generatedPath: string): string | null {
  const adjacent = `${generatedPath}.map`
  try {
    statSync(adjacent)
    return adjacent
  } catch {
    // fall through to the comment
  }

  const url = readSourceMappingURL(generatedPath)
  if (!url || url.startsWith('data:')) return null

  return resolve(dirname(generatedPath), url)
}

function readSourceMappingURL(generatedPath: string): string | null {
  let fd: number | null = null
  try {
    const size = statSync(generatedPath).size
    const length = Math.min(TAIL_BYTES, size)
    if (length === 0) return null

    const buffer = Buffer.alloc(length)
    fd = openSync(generatedPath, 'r')
    readSync(fd, buffer, 0, length, size - length)

    // Last match wins: a bundle can contain the literal string in its own
    // source, and the real annotation is always the final line.
    const matches = [...buffer.toString('utf8').matchAll(/\/[/*]#\s*sourceMappingURL=(\S+)/g)]
    const last = matches[matches.length - 1]
    return last ? (last[1] ?? null) : null
  } catch {
    return null
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd)
      } catch {
        // the descriptor is going away with the process anyway
      }
    }
  }
}
