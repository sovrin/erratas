/**
 * The copy-paste that makes an application start reporting.
 *
 * A registry rather than an `if (php) … else …`, because this list only ever
 * grows: every new SDK is one entry appended here and nothing else in the app
 * changes. The first generator whose `matches` accepts the stack's platform
 * wins, and `FALLBACK_SNIPPET` catches everything else — a stack whose platform
 * nobody recognised still gets a usable instruction rather than a blank panel.
 */

export interface SnippetGenerator {
  id: string
  /** Tested against the stack's free-text platform, lower-cased. */
  matches: (platform: string) => boolean
  render: (dsn: string) => string
}

const JAVASCRIPT_PLATFORMS = [
  'js',
  'javascript',
  'ts',
  'typescript',
  'node',
  'nuxt',
  'vue',
  'react',
]

/**
 * Platforms that run on a server, where source context is a file read away.
 *
 * Matched before `javascript`, since first match wins and `JAVASCRIPT_PLATFORMS`
 * would otherwise swallow `node` and hand back the browser snippet.
 */
const SERVER_PLATFORMS = ['node', 'bun', 'deno', 'express', 'fastify', 'nitro']

export const SNIPPET_GENERATORS: readonly SnippetGenerator[] = [
  {
    id: 'php',
    matches: (platform) => platform.includes('php') || platform.includes('laravel'),
    render: (dsn) => `composer require erratas/sdk

\\Erratas\\Client::init([
    'dsn' => '${dsn}',
]);`,
  },
  {
    id: 'node',
    matches: (platform) => SERVER_PLATFORMS.some((name) => platform.includes(name)),
    render: (dsn) => nodeSnippet(dsn),
  },
  {
    id: 'javascript',
    matches: (platform) => JAVASCRIPT_PLATFORMS.some((name) => platform.includes(name)),
    render: (dsn) => javascriptSnippet(dsn),
  },
]

/**
 * What an unrecognised platform gets.
 *
 * JavaScript, because it is the only SDK that actually exists — pointing a
 * reader at a package we have not written would be worse than pointing them at
 * the one we have.
 */
export const FALLBACK_SNIPPET: SnippetGenerator = {
  id: 'javascript',
  matches: () => true,
  render: (dsn) => javascriptSnippet(dsn),
}

/**
 * The browser snippet.
 *
 * `symbolicate` is commented rather than omitted. A minified bundle produces
 * stack frames like `app-a1b2c3d4.js:1:48213`, which nobody can act on, and this
 * panel is the only place a reader would ever find out there is an answer. It
 * stays commented because it needs an endpoint mounted on their own server
 * first — a snippet that silently points at a route they do not have would look
 * broken.
 */
function javascriptSnippet(dsn: string): string {
  return `npm install @erratas/sdk

import { init } from "@erratas/sdk";

init({
  dsn: "${dsn}",
  // Minified frames? Mount createSymbolicateHandler() from
  // "@erratas/sdk/node" on your own server and point at it, to get the
  // original source lines attached to every report.
  // symbolicate: "/__erratas/symbolicate",
});`
}

/**
 * The server snippet, which can do more than the browser one.
 *
 * Source context is uncommented here because it needs nothing mounted: the
 * process that threw has the file, or the build's source map, on the same disk.
 * The flag note is the one thing people get wrong — with sources absent *and*
 * `--enable-source-maps` on, Node rewrites frames to files that were never
 * deployed and there is nothing left to read.
 */
function nodeSnippet(dsn: string): string {
  return `npm install @erratas/sdk

import { init, captureException } from "@erratas/sdk";
import { withSourceContext } from "@erratas/sdk/node";

init({
  dsn: "${dsn}",
  // Attaches the lines around each throw. If you deploy only your build
  // output, leave --enable-source-maps OFF and the build's .map is used.
  beforeSend: withSourceContext(),
});

// Node is not auto-instrumented: an uncaughtException handler would stop
// your process exiting on a crash, which is not a library's call to make.
captureException(error);`
}

export function snippetFor(
  platform: string,
  dsn: string,
  generators: readonly SnippetGenerator[] = SNIPPET_GENERATORS,
): string {
  const normalised = (platform || '').toLowerCase()
  const generator =
    generators.find((candidate) => candidate.matches(normalised)) ?? FALLBACK_SNIPPET
  return generator.render(dsn)
}
