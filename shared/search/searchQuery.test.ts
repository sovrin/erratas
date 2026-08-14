import { describe, expect, it } from 'vitest'

import { anIssue, TEST_TAG_CONTEXT } from '../test/fixtures'
import {
  setSearchToken,
  composeQuery,
  matchesSearchQuery,
  parseSearchQuery,
  splitQuery,
} from './searchQuery'

const match = (raw: string, issue = anIssue()) =>
  matchesSearchQuery(issue, parseSearchQuery(raw), TEST_TAG_CONTEXT)

describe('parseSearchQuery', () => {
  it('splits tags from free text', () => {
    const query = parseSearchQuery('env:production cannot read')

    expect(query.tags.map((t) => [t.key, t.value])).toEqual([['env', 'production']])
    expect(query.terms).toEqual(['cannot', 'read'])
  })

  it('lower-cases both halves of a tag', () => {
    const [tag] = parseSearchQuery('OS:macOS').tags
    expect(tag?.key).toBe('os')
    expect(tag?.value).toBe('macos')
  })

  // A search that silently returns nothing is the worst possible answer to a
  // token nobody registered — treat it as text and find the string.
  it('treats an unknown key as free text', () => {
    const query = parseSearchQuery('time:12')

    expect(query.tags).toHaveLength(0)
    expect(query.terms).toEqual(['time:12'])
  })

  it.each(['', '   '])('reports %s as empty', (raw) => {
    expect(parseSearchQuery(raw).isEmpty).toBe(true)
  })
})

describe('matchesSearchQuery', () => {
  it('matches an empty query against everything', () => {
    expect(match('')).toBe(true)
  })

  it('matches free text against title, culprit and user', () => {
    expect(match('typeerror')).toBe(true)
    expect(match('userlist.vue')).toBe(true)
    expect(match('lea@quant.fm')).toBe(true)
    expect(match('nothing-like-this')).toBe(false)
  })

  // Substring, not equality: these values come from a dozen runtimes as human
  // strings, and demanding exactness makes the feature unusable.
  it.each([
    ['release:v2.4', true],
    ['release:v2.4.1', true],
    ['release:v9', false],
    ['os:macos', true],
    ['env:prod', true],
    ['level:error', true],
    ['level:warning', false],
    ['stack:frontend', true],
  ])('resolves %s to %s', (raw, expected) => {
    expect(match(raw)).toBe(expected)
  })

  it('accepts aliases for the same dimension', () => {
    expect(match('environment:production')).toBe(true)
    expect(match('version:v2.4.1')).toBe(true)
  })

  // Adding a word to a search must make the result set smaller, which is what
  // makes click-a-tag-to-narrow useful.
  it('ANDs every token', () => {
    expect(match('env:production level:error typeerror')).toBe(true)
    expect(match('env:production level:info')).toBe(false)
  })

  it('does not match a tag whose value is missing on the issue', () => {
    expect(match('browser:chrome', anIssue({ browser: '' }))).toBe(false)
  })
})

describe('setSearchToken', () => {
  it('adds a dimension that is not filtered yet, keeping the free text', () => {
    expect(setSearchToken('typeerror', 'env', 'production')).toBe('typeerror env:production')
  })

  it('sets the token on an empty query', () => {
    expect(setSearchToken('', 'level', 'error')).toBe('level:error')
  })

  /*
   * The two bugs that made this a "set" rather than an "append". Clicking a stat or a tag
   * that is already filtered used to duplicate the chip; clicking a different value for
   * the same dimension used to produce a pair that can never both match, because the tags
   * are ANDed and a resolver returns one value per issue.
   */
  it('does not duplicate a token that is already there', () => {
    expect(setSearchToken('status:unresolved', 'status', 'unresolved')).toBe('status:unresolved')
  })

  it('replaces a different value for the same dimension rather than contradicting it', () => {
    expect(setSearchToken('env:debug', 'env', 'production')).toBe('env:production')
  })

  it('replaces in place, so the chip does not jump to the end', () => {
    expect(setSearchToken('env:debug level:error cannot', 'env', 'production')).toBe(
      'env:production level:error cannot',
    )
  })

  it('collapses an existing pair for one dimension down to one', () => {
    expect(setSearchToken('env:debug env:staging level:error', 'env', 'production')).toBe(
      'env:production level:error',
    )
  })

  it('leaves other dimensions and free text alone', () => {
    expect(setSearchToken('status:unresolved cannot read', 'env', 'debug')).toBe(
      'status:unresolved cannot read env:debug',
    )
  })

  it('truncates a multi-word value at the first word', () => {
    expect(setSearchToken('', 'os', 'macOS 14')).toBe('os:macOS')
  })

  it('is a no-op for a blank value', () => {
    expect(setSearchToken('typeerror', 'user', '  ')).toBe('typeerror')
  })
})

describe('closed-set dimensions', () => {
  /*
   * The bug that forced prefix matching: `unresolved` contains `resolved`, so a
   * substring rule answered `status:resolved` with every unresolved issue.
   */
  it('does not match unresolved when asked for resolved', () => {
    const ctx = TEST_TAG_CONTEXT
    const query = parseSearchQuery('status:resolved')

    expect(matchesSearchQuery(anIssue({ status: 'resolved' }), query, ctx)).toBe(true)
    expect(matchesSearchQuery(anIssue({ status: 'unresolved' }), query, ctx)).toBe(false)
  })

  it('still narrows on a partial value, so typing need not finish the word', () => {
    const ctx = TEST_TAG_CONTEXT

    expect(
      matchesSearchQuery(anIssue({ status: 'resolved' }), parseSearchQuery('status:res'), ctx),
    ).toBe(true)
    expect(
      matchesSearchQuery(anIssue({ status: 'unresolved' }), parseSearchQuery('status:un'), ctx),
    ).toBe(true)
    expect(
      matchesSearchQuery(anIssue({ level: 'error' }), parseSearchQuery('level:err'), ctx),
    ).toBe(true)
  })

  it('keeps substring matching for the free-text dimensions', () => {
    const ctx = TEST_TAG_CONTEXT

    expect(matchesSearchQuery(anIssue({ os: 'macOS 14' }), parseSearchQuery('os:macos'), ctx)).toBe(
      true,
    )
    expect(
      matchesSearchQuery(anIssue({ release: 'v2.4.1' }), parseSearchQuery('release:2.4'), ctx),
    ).toBe(true)
  })
})

describe('an unfinished token', () => {
  it('is ignored for a known dimension, so the list holds while a value is picked', () => {
    const query = parseSearchQuery('env:')

    expect(query.tags).toEqual([])
    expect(query.terms).toEqual([])
    expect(query.isEmpty).toBe(true)
    expect(matchesSearchQuery(anIssue(), query, TEST_TAG_CONTEXT)).toBe(true)
  })

  it('does not weaken the tokens beside it', () => {
    const query = parseSearchQuery('status:unresolved env:')

    expect(query.tags.map((t) => t.key)).toEqual(['status'])
    expect(matchesSearchQuery(anIssue({ status: 'unresolved' }), query, TEST_TAG_CONTEXT)).toBe(
      true,
    )
    expect(matchesSearchQuery(anIssue({ status: 'resolved' }), query, TEST_TAG_CONTEXT)).toBe(false)
  })

  it('still treats an unregistered key as free text, colon and all', () => {
    const query = parseSearchQuery('enviroment:')

    expect(query.tags).toEqual([])
    expect(query.terms).toEqual(['enviroment:'])
  })
})

describe('splitQuery', () => {
  it('chips complete tags and leaves free text in the input', () => {
    expect(splitQuery('status:unresolved cannot read')).toEqual({
      tags: [{ key: 'status', value: 'unresolved' }],
      text: 'cannot read',
    })
  })

  it('leaves an unfinished token as text, so accepting a dimension is still editable', () => {
    // What the autocomplete inserts when a dimension is chosen.
    expect(splitQuery('env:')).toEqual({ tags: [], text: 'env:' })
  })

  it('leaves an unregistered key as text rather than claiming a filter is active', () => {
    expect(splitQuery('enviroment:prod')).toEqual({ tags: [], text: 'enviroment:prod' })
  })

  it('keeps every tag, including repeats of one dimension', () => {
    expect(splitQuery('env:prod env:staging').tags).toEqual([
      { key: 'env', value: 'prod' },
      { key: 'env', value: 'staging' },
    ])
  })

  it('handles an empty query', () => {
    expect(splitQuery('')).toEqual({ tags: [], text: '' })
  })
})

describe('composeQuery', () => {
  it('round-trips with splitQuery', () => {
    for (const raw of [
      'status:unresolved env:debug cannot read',
      'cannot read',
      'env:',
      'status:unresolved',
      '',
    ]) {
      const split = splitQuery(raw)
      const recomposed = composeQuery(split.tags, split.text)
      // Same tokens, and splitting again is stable.
      expect(splitQuery(recomposed)).toEqual(split)
    }
  })

  it('puts chips first, so the string does not reshuffle as chips change', () => {
    expect(composeQuery([{ key: 'env', value: 'debug' }], 'cannot')).toBe('env:debug cannot')
    const split = splitQuery('cannot env:debug')
    expect(composeQuery(split.tags, split.text)).toBe('env:debug cannot')
  })

  it('emits nothing for no chips and no text', () => {
    expect(composeQuery([], '   ')).toBe('')
  })
})
