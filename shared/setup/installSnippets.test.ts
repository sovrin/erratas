import { describe, expect, it } from 'vitest'

import { snippetFor, type SnippetGenerator } from './installSnippets'

const DSN = 'https://8f2ac1e9b7d4@erratas.sh/1'

describe('snippetFor', () => {
  it.each(['php', 'PHP 8.3', 'laravel'])('gives %s the composer snippet', (platform) => {
    const snippet = snippetFor(platform, DSN)

    expect(snippet).toContain('composer require erratas/sdk')
    expect(snippet).toContain(DSN)
  })

  it.each(['nuxt', 'node', 'TypeScript', 'react'])('gives %s the npm snippet', (platform) => {
    const snippet = snippetFor(platform, DSN)

    expect(snippet).toContain('npm install @erratas/sdk')
    expect(snippet).toContain(`init({ dsn: "${DSN}" })`)
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
