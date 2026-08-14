/**
 * Paging the issue list.
 *
 * Ten rows because an expanded issue is tall — a tag grid plus a stack trace
 * with source context — and a longer page turns the list into a scroll hunt.
 */
export const ISSUES_PER_PAGE = 10

export interface Page<T> {
  items: T[]
  /** Clamped into range: a filter change can strand the reader past the end. */
  page: number
  totalPages: number
  total: number
  hasPagination: boolean
  /** "1–10 of 47" */
  label: string
  hasPrevious: boolean
  hasNext: boolean
}

export function paginate<T>(
  items: readonly T[],
  requestedPage: number,
  perPage: number = ISSUES_PER_PAGE,
): Page<T> {
  const total = items.length
  // At least one page even when empty, so the reader is never on "page 0 of 0".
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  // Clamping rather than resetting to 1: narrowing a filter while on page 4
  // should land on the last page of the new result set, not throw the reader
  // back to the top of a list they were part-way through.
  const page = Math.min(Math.max(1, Math.floor(requestedPage) || 1), totalPages)
  const start = (page - 1) * perPage
  const end = Math.min(start + perPage, total)

  return {
    items: items.slice(start, end),
    page,
    totalPages,
    total,
    hasPagination: totalPages > 1,
    label: total === 0 ? '0 of 0' : `${start + 1}–${end} of ${total}`,
    hasPrevious: page > 1,
    hasNext: page < totalPages,
  }
}
