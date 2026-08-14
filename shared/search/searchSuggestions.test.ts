import { describe, expect, it } from 'vitest'

import { anIssue, TEST_TAG_CONTEXT } from '../test/fixtures'
import {
  activeTokenAt,
  applySuggestion,
  MAX_SUGGESTIONS,
  suggestSearch,
  suggestableKeys,
  type Suggestion,
} from './searchSuggestions'

const suggest = (raw: string, issues = [anIssue()], caret = raw.length) =>
  suggestSearch({ raw, caret, issues, ctx: TEST_TAG_CONTEXT })

const labels = (raw: string, issues?: Parameters<typeof suggest>[1]) =>
  suggest(raw, issues).suggestions.map((s) => s.label)

describe('suggestableKeys', () => {
  it('offers each dimension once, hiding the parser-only aliases', () => {
    const keys = suggestableKeys()
    expect(keys).toContain('env')
    expect(keys).toContain('release')
    // `environment`, `version` and `app` still parse; offering them would imply
    // they filter something different from the canonical key.
    expect(keys).not.toContain('environment')
    expect(keys).not.toContain('version')
    expect(keys).not.toContain('app')
  })
})

describe('activeTokenAt', () => {
  it('bounds the token the caret is inside, not the last one', () => {
    const raw = 'env:prod release:v2'
    // Caret just after `prod`.
    expect(activeTokenAt(raw, 8)).toEqual({ start: 0, end: 8 })
    expect(activeTokenAt(raw, raw.length)).toEqual({ start: 9, end: 19 })
  })

  it('returns an empty range on whitespace, so a fresh token completes keys', () => {
    expect(activeTokenAt('env:prod ', 9)).toEqual({ start: 9, end: 9 })
  })
})

describe('suggestSearch — dimensions', () => {
  it('offers every dimension on an empty box', () => {
    const result = suggest('')
    expect(result.suggestions.every((s) => s.kind === 'key')).toBe(true)
    expect(result.suggestions.length).toBeGreaterThan(0)
  })

  it('narrows the dimensions by what has been typed', () => {
    expect(labels('re')).toEqual(['release:'])
    expect(labels('s')).toEqual(['stack:', 'status:'])
  })

  it('offers nothing once the word matches no dimension — that is free text', () => {
    expect(labels('cannot')).toEqual([])
  })

  it('inserts a colon and no space, so the value follows in the same token', () => {
    const result = suggest('env')
    const applied = applySuggestion('env', result, result.suggestions[0]!)
    expect(applied.raw).toBe('env:')
    expect(applied.caret).toBe(4)
  })
})

describe('suggestSearch — values', () => {
  const issues = [
    anIssue({ id: 'a', environment: 'production', release: 'v2.4.1' }),
    anIssue({ id: 'b', environment: 'production', release: 'v2.4.1' }),
    anIssue({ id: 'c', environment: 'staging', release: 'v1.0.0' }),
  ]

  it('offers the values present, commonest first', () => {
    expect(labels('env:', issues)).toEqual(['production', 'staging'])
  })

  it('substring-matches the partial value, like the matcher itself does', () => {
    expect(labels('env:stag', issues)).toEqual(['staging'])
  })

  it('counts issues behind each value', () => {
    const counts = suggest('env:', issues).suggestions.map((s) => [
      s.label,
      (s as never as { count: number }).count,
    ])
    expect(counts).toEqual([
      ['production', 2],
      ['staging', 1],
    ])
  })

  /**
   * The property the status tabs used to have, generalised: counts describe the set
   * the *other* tokens narrowed, so they match the list on screen rather than the
   * whole project.
   */
  it('counts within the set the other tokens already narrowed', () => {
    const counts = suggest('release:v1 env:', issues).suggestions.map((s) => [
      s.label,
      (s as never as { count: number }).count,
    ])
    expect(counts).toEqual([['staging', 1]])
  })

  it('ignores the token being edited when narrowing, so its own value is not excluded', () => {
    // Without splicing the active token out, `env:production` would narrow to
    // production and then offer only production — the menu could never widen.
    expect(labels('env:staging', issues)).toEqual(['staging'])
    const raw = 'env:zzz'
    expect(suggest(raw, issues).suggestions).toEqual([])
  })

  it('truncates multi-word values at the first word, as setSearchToken does', () => {
    // `macOS 14` would arrive as a tag plus a stray text term matching nothing.
    expect(labels('os:', [anIssue({ os: 'macOS 14' })])).toEqual(['macOS'])
  })

  it('offers nothing for a key nobody registered', () => {
    expect(suggest('time:12', issues).suggestions).toEqual([])
  })

  it('caps the menu', () => {
    const many = Array.from({ length: 30 }, (_, i) => anIssue({ id: `i${i}`, release: `v${i}` }))
    expect(suggest('release:', many).suggestions).toHaveLength(MAX_SUGGESTIONS)
  })

  it('appends a trailing space so the next token can be typed straight away', () => {
    const result = suggest('env:', issues)
    const applied = applySuggestion('env:', result, result.suggestions[0]!)
    expect(applied.raw).toBe('env:production ')
    expect(applied.caret).toBe(15)
  })

  it('splices over a token in the middle without disturbing the rest', () => {
    const raw = 'env:prod release:v2.4.1'
    const result = suggestSearch({ raw, caret: 8, issues, ctx: TEST_TAG_CONTEXT })
    const applied = applySuggestion(raw, result, result.suggestions[0] as Suggestion)
    expect(applied.raw).toBe('env:production release:v2.4.1')
  })
})

describe('the dimension list is never truncated', () => {
  /*
   * The value cap must not reach the keys: it hid `runtime`, the ninth of nine, from
   * the list whose whole purpose is saying what can be filtered on.
   */
  it('offers every suggestable dimension on an empty box', () => {
    const offered = suggest('').suggestions.map((s) => s.label)
    expect(offered).toEqual(suggestableKeys().map((key) => `${key}:`))
    expect(offered).toContain('runtime:')
    expect(offered.length).toBeGreaterThan(MAX_SUGGESTIONS)
  })
})
