import { describe, expect, it } from 'vitest'

import { snippetFor, type SnippetGenerator } from './installSnippets'

const DSN = 'https://8f2ac1e9b7d4@erratas.sh/1'

describe('snippetFor', () => {
  it.each(['php', 'PHP 8.3', 'laravel'])('gives %s the composer snippet', (platform) => {
    const snippet = snippetFor(platform, DSN)

    expect(snippet).toContain('composer require erratas/sdk')
    expect(snippet).toContain(DSN)
  })

  it.each(['nuxt', 'TypeScript', 'react', 'vue'])(
    'gives %s the browser snippet, with symbolication offered',
    (platform) => {
      const snippet = snippetFor(platform, DSN)

      expect(snippet).toContain('npm install @erratas/sdk')
      expect(snippet).toContain(`dsn: "${DSN}"`)
      // Commented, not omitted: a minified frame is unreadable and this panel is
      // the only place a reader learns there is an answer. Uncommented it would
      // point at a route they have not mounted.
      expect(snippet).toContain('// symbolicate: "/__erratas/symbolicate"')
      expect(snippet).not.toContain('withSourceContext')
    },
  )

  it.each(['node', 'node 24', 'bun', 'deno', 'express'])(
    'gives %s the server snippet, with source context switched on',
    (platform) => {
      const snippet = snippetFor(platform, DSN)

      expect(snippet).toContain(`dsn: "${DSN}"`)
      // Uncommented here, because it needs nothing mounted — the file or the
      // build's map is on the same disk as the code that threw.
      expect(snippet).toContain('beforeSend: withSourceContext()')
      expect(snippet).toContain('@erratas/sdk/node')
    },
  )

  // `node` is in both platform lists, and the server generator is registered
  // first on purpose. Reverse the order and every Node stack is handed browser
  // instructions that cannot read a source map.
  it('prefers the server snippet over the browser one for node', () => {
    expect(snippetFor('node', DSN)).toContain('withSourceContext')
  })

  // A stack whose platform nobody recognised still needs a usable instruction —
  // a blank panel reads as a broken page.
  it.each(['', 'rust', 'something nobody has written yet'])(
    'falls back to JavaScript for %s',
    (platform) => {
      expect(snippetFor(platform, DSN)).toContain('npm install @erratas/sdk')
    },
  )

  // The registry is the extension point: a new SDK is one entry, and nothing
  // else in the app changes.
  it('prefers a generator registered ahead of the built-ins', () => {
    const custom: SnippetGenerator = {
      id: 'go',
      matches: (platform) => platform.includes('go'),
      render: (dsn) => `go get erratas.sh/sdk // ${dsn}`,
    }

    expect(snippetFor('go', DSN, [custom])).toBe(`go get erratas.sh/sdk // ${DSN}`)
  })
})
