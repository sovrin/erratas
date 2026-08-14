import { describe, expect, it } from 'vitest'

import { safeRedirectPath } from './safeRedirect'

/**
 * These are security cases, not formatting ones. Every rejection below is a way
 * the login page could be turned into an open redirect — a real login form that
 * hands the reader to somebody else's site once they have authenticated.
 */
describe('safeRedirectPath', () => {
  it.each(['/issues/abc123', '/', '/issues/abc123?q=release:v1', '/some/deep/path#frag'])(
    'accepts the same-origin path %s',
    (next) => {
      expect(safeRedirectPath(next)).toBe(next)
    },
  )

  it.each([
    // Protocol-relative: a URL wearing a path's clothes, and the main event.
    ['//evil.example', 'protocol-relative'],
    ['//evil.example/login', 'protocol-relative with a path'],
    ['https://evil.example', 'absolute URL'],
    ['http://evil.example', 'absolute URL'],
    ['javascript:alert(1)', 'a scheme that is not http at all'],
    // Browsers and routers disagree about backslashes, so `/\` can become `//`.
    ['/\\evil.example', 'backslash that may normalise to a slash'],
    ['\\\\evil.example', 'UNC-looking path'],
    // Relative paths resolve against whatever the current route happens to be.
    ['issues/abc123', 'no leading slash'],
    ['../admin', 'traversal'],
    // Control characters are stripped inconsistently between parsers.
    ['/\nhttps://evil.example', 'embedded newline'],
    ['/\thttps://evil.example', 'embedded tab'],
    ['/ /evil.example', 'embedded space'],
  ])('rejects %s (%s)', (next) => {
    expect(safeRedirectPath(next)).toBe('/')
  })

  it('refuses to send anyone from login back to login', () => {
    expect(safeRedirectPath('/login')).toBe('/')
    expect(safeRedirectPath('/login?next=/login')).toBe('/')
  })

  it.each([undefined, null, '', 42, {}, ['/issues/a']])(
    'falls back for the non-string %s',
    (next) => {
      expect(safeRedirectPath(next)).toBe('/')
    },
  )

  it('honours a caller-supplied fallback', () => {
    expect(safeRedirectPath('//evil.example', '/somewhere')).toBe('/somewhere')
  })
})
