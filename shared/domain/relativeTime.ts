/**
 * "12m", "3h", "9d" — how long ago something happened.
 *
 * The design showed these as literal strings on the mock data. Storing them
 * that way would make a list lie the moment the page sat open, and would sort
 * alphabetically, so the store holds real dates and the rendering happens here.
 *
 * `now` is a parameter rather than a `Date.now()` call so this stays a pure
 * function: the tests do not have to freeze the clock, and a component that
 * re-renders on a ticking clock passes its own value.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Milliseconds since an ISO timestamp, or null when it is missing/unparseable. */
export function ageMs(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return null
  // A clock skewed into the future would otherwise render as a negative age.
  return Math.max(0, now - at)
}

/**
 * Compact form for a table cell: at most three characters plus a unit.
 *
 * Rounds down, because "59m" is a more honest answer than "1h" for something
 * that happened 59 minutes ago, and a reader scanning for what is on fire cares
 * about the boundary.
 */
export function formatAge(iso: string | null | undefined, now: number): string {
  const age = ageMs(iso, now)
  if (age === null) return '—'
  if (age < MINUTE) return 'now'
  if (age < HOUR) return `${Math.floor(age / MINUTE)}m`
  if (age < DAY) return `${Math.floor(age / HOUR)}h`
  return `${Math.floor(age / DAY)}d`
}

/** Same value, phrased for prose: "9d ago". */
export function formatAgeAgo(iso: string | null | undefined, now: number): string {
  const compact = formatAge(iso, now)
  if (compact === '—' || compact === 'now') return compact
  return `${compact} ago`
}

/**
 * Orders issues newest-first, which is the only order the list is ever shown in.
 *
 * Missing timestamps sort last rather than first: an issue with no `lastSeen`
 * is a data problem, and putting it at the top of everyone's dashboard would
 * make one bad row look like the most urgent thing in the project.
 */
export function compareByLastSeenDesc(
  a: { lastSeen: string | null },
  b: { lastSeen: string | null },
): number {
  const left = a.lastSeen ? Date.parse(a.lastSeen) : Number.NaN
  const right = b.lastSeen ? Date.parse(b.lastSeen) : Number.NaN
  const leftMissing = Number.isNaN(left)
  const rightMissing = Number.isNaN(right)
  if (leftMissing && rightMissing) return 0
  if (leftMissing) return 1
  if (rightMissing) return -1
  return right - left
}
