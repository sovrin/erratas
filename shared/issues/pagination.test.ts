import { describe, expect, it } from 'vitest'

import { paginate } from './pagination'

const items = Array.from({ length: 47 }, (_, i) => i + 1)

describe('paginate', () => {
  it('slices the requested page', () => {
    expect(paginate(items, 1, 10).items).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(paginate(items, 5, 10).items).toEqual([41, 42, 43, 44, 45, 46, 47])
  })

  it('labels the range', () => {
    expect(paginate(items, 1, 10).label).toBe('1–10 of 47')
    expect(paginate(items, 5, 10).label).toBe('41–47 of 47')
  })

  // Narrowing a filter while on page 4 should land on the last page of the new
  // result set, not throw the reader back to the top of a list they were
  // part-way through.
  it('clamps a page past the end rather than resetting to one', () => {
    const page = paginate(items, 99, 10)

    expect(page.page).toBe(5)
    expect(page.items).toEqual([41, 42, 43, 44, 45, 46, 47])
  })

  it.each([0, -3, Number.NaN])('clamps %s up to page one', (requested) => {
    expect(paginate(items, requested, 10).page).toBe(1)
  })

  it('never reports page 0 of 0', () => {
    const page = paginate([], 1, 10)

    expect(page.page).toBe(1)
    expect(page.totalPages).toBe(1)
    expect(page.label).toBe('0 of 0')
    expect(page.hasPagination).toBe(false)
  })

  it('hides pagination when everything fits', () => {
    expect(paginate([1, 2, 3], 1, 10).hasPagination).toBe(false)
  })

  it.each([
    [1, false, true],
    [3, true, true],
    [5, true, false],
  ])('reports prev/next on page %s', (page, hasPrevious, hasNext) => {
    const result = paginate(items, page, 10)

    expect(result.hasPrevious).toBe(hasPrevious)
    expect(result.hasNext).toBe(hasNext)
  })
})
