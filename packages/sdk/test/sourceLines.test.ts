import { describe, expect, it } from 'vitest'

import { MAX_LINE_CHARS, sliceSourceLines } from '../src/sourceLines'

const SOURCE = [
  'import { User } from "./User"',
  '',
  'export class UserRepository {',
  '  create(data: UserData): User {',
  '    return User.query().create(data)',
  '  }',
  '}',
].join('\n')

describe('sliceSourceLines', () => {
  it('centres the window on the offending line and marks only it', () => {
    const window = sliceSourceLines(SOURCE, 5, { before: 2, after: 1 })

    expect(window.map((line) => line.n)).toEqual([3, 4, 5, 6])
    expect(window.filter((line) => line.err).map((line) => line.n)).toEqual([5])
    expect(window.find((line) => line.n === 5)?.text).toBe('    return User.query().create(data)')
  })

  it('keeps real line numbers, not window offsets', () => {
    // The dashboard prints `n` in the gutter; renumbering from 1 would send a
    // reader to the wrong part of the file.
    const window = sliceSourceLines(SOURCE, 5, { before: 1, after: 0 })

    expect(window.map((line) => line.n)).toEqual([4, 5])
  })

  it('clamps to the start and end of the file', () => {
    expect(sliceSourceLines(SOURCE, 1, { before: 5, after: 1 }).map((l) => l.n)).toEqual([1, 2])
    expect(sliceSourceLines(SOURCE, 7, { before: 1, after: 5 }).map((l) => l.n)).toEqual([6, 7])
  })

  it('preserves indentation, which is often the only clue about scope', () => {
    const window = sliceSourceLines(SOURCE, 4, { before: 0, after: 0 })

    expect(window[0]!.text).toBe('  create(data: UserData): User {')
  })

  it('refuses a minified file rather than returning a slab of it', () => {
    // The whole bundle is line 1. Four hundred characters of `t.prototype.n=…`
    // is noise dressed as source, so nothing is better.
    const minified = `t.prototype.create=function(e){${'x'.repeat(MAX_LINE_CHARS)}}`

    expect(sliceSourceLines(minified, 1)).toEqual([])
  })

  it('truncates a long neighbour instead of dropping it', () => {
    // A hole in the middle of the window would misalign what the reader scans
    // against the gutter numbers.
    const source = ['short', 'y'.repeat(MAX_LINE_CHARS + 50), 'target'].join('\n')

    const window = sliceSourceLines(source, 3, { before: 2, after: 0 })

    expect(window.map((line) => line.n)).toEqual([1, 2, 3])
    expect(window[1]!.text).toHaveLength(MAX_LINE_CHARS)
  })

  it('handles CRLF files without trailing carriage returns', () => {
    const window = sliceSourceLines('one\r\ntwo\r\nthree', 2, { before: 1, after: 1 })

    expect(window.map((line) => line.text)).toEqual(['one', 'two', 'three'])
  })

  it('returns nothing for a line number outside the file', () => {
    expect(sliceSourceLines(SOURCE, 99)).toEqual([])
    expect(sliceSourceLines(SOURCE, 0)).toEqual([])
    expect(sliceSourceLines(SOURCE, -1)).toEqual([])
    expect(sliceSourceLines(SOURCE, 1.5)).toEqual([])
  })

  it('returns nothing for empty or non-string source', () => {
    expect(sliceSourceLines('', 1)).toEqual([])
    expect(sliceSourceLines(undefined as unknown as string, 1)).toEqual([])
  })

  it('falls back to the default window for nonsense counts', () => {
    const window = sliceSourceLines(SOURCE, 5, { before: -3, after: 1.5 })

    expect(window.map((line) => line.n)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })
})
