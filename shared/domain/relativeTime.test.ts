import { describe, expect, it } from 'vitest'

import { compareByLastSeenDesc, formatAge, formatAgeAgo } from './relativeTime'

const NOW = Date.parse('2026-08-14T12:00:00.000Z')

const ago = (ms: number) => new Date(NOW - ms).toISOString()

describe('formatAge', () => {
  it.each([
    [0, 'now'],
    [30_000, 'now'],
    [60_000, '1m'],
    [12 * 60_000, '12m'],
    [59 * 60_000, '59m'],
    [60 * 60_000, '1h'],
    [3 * 60 * 60_000, '3h'],
    [23 * 60 * 60_000, '23h'],
    [24 * 60 * 60_000, '1d'],
    [9 * 24 * 60 * 60_000, '9d'],
  ])('renders %ims as %s', (offset, expected) => {
    expect(formatAge(ago(offset), NOW)).toBe(expected)
  })

  // Rounding down keeps the unit boundary honest: something 59 minutes old is
  // not "1h", and a reader scanning for what is on fire reads that boundary.
  it('rounds down rather than to nearest', () => {
    expect(formatAge(ago(119 * 60_000), NOW)).toBe('1h')
  })

  // A reporting machine's clock can be ahead of this one; that is a fact about
  // the world, not something to render as a negative age.
  it('clamps a future timestamp to now', () => {
    expect(formatAge(new Date(NOW + 60_000).toISOString(), NOW)).toBe('now')
  })

  it.each([null, undefined, '', 'not-a-date'])('renders %s as a dash', (input) => {
    expect(formatAge(input, NOW)).toBe('—')
  })
})

describe('formatAgeAgo', () => {
  it('adds the suffix to a real age', () => {
    expect(formatAgeAgo(ago(9 * 24 * 60 * 60_000), NOW)).toBe('9d ago')
  })

  it.each([
    [ago(0), 'now'],
    [null, '—'],
  ])('leaves %s alone', (input, expected) => {
    expect(formatAgeAgo(input, NOW)).toBe(expected)
  })
})

describe('compareByLastSeenDesc', () => {
  it('puts the most recent first', () => {
    const sorted = [
      { lastSeen: ago(3 * 60 * 60_000) },
      { lastSeen: ago(60_000) },
      { lastSeen: ago(24 * 60 * 60_000) },
    ].sort(compareByLastSeenDesc)

    expect(sorted.map((i) => formatAge(i.lastSeen, NOW))).toEqual(['1m', '3h', '1d'])
  })

  // An issue with no timestamp is a data problem. Sorting it to the top would
  // put one bad row above everything genuinely on fire.
  it('sorts missing timestamps last', () => {
    const sorted = [{ lastSeen: null }, { lastSeen: ago(60_000) }].sort(compareByLastSeenDesc)

    expect(sorted[0]?.lastSeen).not.toBeNull()
    expect(sorted[1]?.lastSeen).toBeNull()
  })
})
