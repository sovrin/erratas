import { describe, expect, it } from 'vitest'

import { anIssue, TEST_TAG_CONTEXT } from '../test/fixtures'
import { appendSearchToken, matchesSearchQuery, parseSearchQuery } from './searchQuery'

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

describe('appendSearchToken', () => {
  it('appends to an existing query', () => {
    expect(appendSearchToken('typeerror', 'env', 'production')).toBe('typeerror env:production')
  })

  it('does not lead with a space when the box was empty', () => {
    expect(appendSearchToken('', 'level', 'error')).toBe('level:error')
  })

  // The box splits on whitespace, so a two-word value would arrive as a tag
  // plus a stray term that matches nothing.
  it('truncates a multi-word value at the first word', () => {
    expect(appendSearchToken('', 'os', 'macOS 14')).toBe('os:macOS')
  })

  it('ignores an empty value', () => {
    expect(appendSearchToken('typeerror', 'user', '  ')).toBe('typeerror')
  })
})
