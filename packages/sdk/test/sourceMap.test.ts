import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { withSourceContext } from '../src/node/sourceContext'
import { MAX_CACHED_MAPS, resolveViaSourceMap, type SourceMapCache } from '../src/node/sourceMap'
import { PAYLOAD_VERSION, type ErratasEvent, type StackFrame } from '../src/types'

/**
 * The deployment that ships only `dist/`.
 *
 * Fixtures are hand-built rather than produced by running a bundler: the whole
 * point of these cases is what happens when the original files are *not* there,
 * and a test that shells out to esbuild would be testing esbuild.
 *
 * `mappings` is one VLQ segment. `AAEA` is the deltas `[0, 0, 2, 0]` — generated
 * line 0 column 0 maps to source 0, original line 2 (0-based, so line 3),
 * column 0.
 */

const ORIGINAL = ['const a = 1', 'const b = 2', 'throw new Error("boom")', 'const c = 3'].join('\n')

let dir: string
let bundle: string

function writeBundle(name: string, map: Record<string, unknown> | null, annotate = false) {
  const path = join(dir, name)
  writeFileSync(
    path,
    `${'x'.repeat(600)}\n${annotate ? `//# sourceMappingURL=${name}.custom` : ''}`,
  )
  if (map)
    writeFileSync(join(dir, annotate ? `${name}.custom` : `${name}.map`), JSON.stringify(map))
  return path
}

const baseMap = {
  version: 3,
  sources: ['../src/a.ts'],
  sourcesContent: [ORIGINAL],
  names: [],
  mappings: 'AAEA',
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'erratas-map-'))
  bundle = writeBundle('app.js', baseMap)
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

function anEvent(frames: StackFrame[]): ErratasEvent {
  return {
    v: PAYLOAD_VERSION,
    event_id: 'a'.repeat(32),
    timestamp: '2026-08-16T00:00:00.000Z',
    level: 'error',
    platform: 'javascript',
    sdk: { name: 'erratas', version: '0' },
    exception: { type: 'Error', value: 'boom', frames },
  }
}

describe('resolveViaSourceMap', () => {
  it('converts a 1-based frame position to the original 1-based position', () => {
    // The off-by-one here is the bug worth pinning: findEntry is 0-based on
    // both axes, and a silent one-line shift looks entirely plausible.
    const resolved = resolveViaSourceMap(bundle, 1, 1, new Map())

    expect(resolved).toMatchObject({ source: 'src/a.ts', line: 3, column: 1 })
    expect(resolved!.content).toBe(ORIGINAL)
  })

  it('strips bundler path noise so grouping does not move with the output dir', () => {
    const cache: SourceMapCache = new Map()
    const webpack = writeBundle('wp.js', {
      ...baseMap,
      sources: ['webpack://my-app/./src/deep/a.ts'],
    })

    expect(resolveViaSourceMap(webpack, 1, 1, cache)?.source).toBe('src/deep/a.ts')
  })

  it('finds a map named by a sourceMappingURL comment', () => {
    const custom = writeBundle('custom.js', baseMap, true)

    expect(resolveViaSourceMap(custom, 1, 1, new Map())?.line).toBe(3)
  })

  it('gives up when the map carries no sourcesContent', () => {
    // Positions still resolve, but there is no text to quote — location without
    // code is the correct outcome, not a guess.
    const bare = writeBundle('bare.js', { ...baseMap, sourcesContent: undefined })

    expect(resolveViaSourceMap(bare, 1, 1, new Map())).toBeNull()
  })

  it('returns null for a file with no map at all, and keeps no miss', () => {
    const cache: SourceMapCache = new Map()
    const plain = writeBundle('plain.js', null)

    expect(resolveViaSourceMap(plain, 1, 1, cache)).toBeNull()
    expect(cache.has(plain)).toBe(false)
  })

  it('keeps only the newest maps', () => {
    const cache: SourceMapCache = new Map()
    const bundles = Array.from({ length: MAX_CACHED_MAPS + 1 }, (_, i) =>
      writeBundle(`many${i}.js`, baseMap),
    )
    for (const each of bundles) resolveViaSourceMap(each, 1, 1, cache)

    expect(cache.size).toBe(MAX_CACHED_MAPS)
    expect(cache.has(bundles[0]!)).toBe(false)
    expect(cache.has(bundles[MAX_CACHED_MAPS]!)).toBe(true)
  })

  it('survives a corrupt map', () => {
    const broken = join(dir, 'broken.js')
    writeFileSync(broken, 'x')
    writeFileSync(`${broken}.map`, '{ not json')

    expect(resolveViaSourceMap(broken, 1, 1, new Map())).toBeNull()
  })
})

describe('withSourceContext, through a source map', () => {
  it('recovers code for a minified frame and rewrites the location to match', () => {
    // Without the rewrite the panel would show `app.js:1:1` above a listing of
    // TypeScript, with gutter numbers agreeing with neither.
    const result = withSourceContext({ before: 1, after: 1 })(
      anEvent([{ filename: bundle, lineno: 1, colno: 1, function: 'e' }]),
    )

    const frame = result.exception!.frames[0]!
    expect(frame.filename).toBe('src/a.ts')
    expect(frame.lineno).toBe(3)
    expect(frame.code!.map((line) => line.n)).toEqual([2, 3, 4])
    expect(frame.code!.find((line) => line.err)?.text).toBe('throw new Error("boom")')
  })

  it('keeps the minified function name when the map recorded none', () => {
    // Erasing a name we cannot improve on would lose the only identifier the
    // frame had.
    const result = withSourceContext()(anEvent([{ filename: bundle, lineno: 1, function: 'e' }]))

    expect(result.exception!.frames[0]!.function).toBe('e')
  })
})
