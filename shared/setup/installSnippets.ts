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

function javascriptSnippet(dsn: string): string {
  return `npm install @erratas/sdk

import { init } from "@erratas/sdk";

init({ dsn: "${dsn}" });`
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
