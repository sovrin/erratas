// Turning a reported event into an issue. Shared by ingest.pb.js — PocketBase
// runs each hook handler in an isolated VM, so this is require()'d inside the
// handler rather than defined top-level.
//
// Everything here treats its input as hostile. It is a JSON blob posted by an
// unauthenticated stranger's browser, and the only thing standing between it
// and the database is this file. The rules:
//
//   - Nothing throws except through `reject()`, which carries a status.
//   - Every string that reaches a column is clamped to that column's max, so a
//     long field is truncated rather than becoming a validation error the
//     caller sees as a 500.
//   - Every array is capped before it is walked.
//   - Nothing is trusted to be the type it claims. `frames` is the field most
//     likely to be a number, or a string, or an array of nulls.
//
// The pure parts are exported and unit-tested from ingest.test.ts. Keep them
// free of `$app` so that stays possible.

/** Refused before parsing. Well past any real event; the SDK's own cap is 60KB. */
const MAX_EVENT_BYTES = 200 * 1024

/** Column widths from 1754750102_created_issues.js. */
const MAX = {
  title: 500,
  culprit: 500,
  environment: 60,
  release: 60,
  user: 200,
  os: 60,
  browser: 60,
  runtime: 120,
  fingerprint: 128,
}

const MAX_FRAMES = 50
const MAX_CODE_LINES = 20

/** See the seenUsers migration for why this is bounded. */
const MAX_SEEN_USERS = 500

const LEVELS = ['error', 'warning', 'info']

/**
 * The payload versions this understands.
 *
 * Released SDKs live in applications nobody here controls, so this list only
 * ever grows — a version is added when the shape changes and the old entry
 * stays. An unknown version is refused rather than best-effort parsed, because
 * guessing at a shape from the future is how a field silently lands in the
 * wrong column.
 */
const SUPPORTED_VERSIONS = [1]

function reject(status, message) {
  const err = new Error(message)
  err.ingestStatus = status
  return err
}

function clamp(value, max) {
  if (typeof value !== 'string') return ''
  return value.length > max ? value.slice(0, max) : value
}

function oneOf(value, allowed, fallback) {
  return allowed.indexOf(value) === -1 ? fallback : value
}

/**
 * Converts the SDK's wire frames into the shape the dashboard renders.
 *
 * The two differ on purpose: the wire carries `filename`/`function`/`lineno`/
 * `colno` because that is what an engine gives an SDK, and the dashboard wants
 * a single `loc` string because assembling one per platform in the UI would
 * mean the UI knowing about platforms.
 */
function toDisplayFrames(raw) {
  if (!Array.isArray(raw)) return []

  const frames = []
  for (let i = 0; i < raw.length && frames.length < MAX_FRAMES; i++) {
    const frame = raw[i]
    if (!frame || typeof frame !== 'object') continue

    const filename = typeof frame.filename === 'string' ? frame.filename : ''
    const lineno = typeof frame.lineno === 'number' ? frame.lineno : null
    const colno = typeof frame.colno === 'number' ? frame.colno : null

    let loc = filename
    if (loc && lineno !== null) loc += ':' + lineno + (colno !== null ? ':' + colno : '')

    const display = {
      func: typeof frame.function === 'string' && frame.function ? frame.function : '?',
      loc: loc || 'unknown',
    }

    // Source context, captured at throw time by the SDK — from disk in Node,
    // or from the app's own symbolicate endpoint in a browser.
    if (Array.isArray(frame.code)) {
      const code = []
      for (let j = 0; j < frame.code.length && code.length < MAX_CODE_LINES; j++) {
        const line = frame.code[j]
        if (!line || typeof line !== 'object') continue
        if (typeof line.n !== 'number' || typeof line.text !== 'string') continue
        code.push({ n: line.n, text: clamp(line.text, 400), err: line.err === true })
      }
      if (code.length) display.code = code
    }

    frames.push(display)
  }

  return frames
}

/** "Where it happened", in one line, from the innermost frame. */
function culpritOf(frames) {
  const top = frames[0]
  if (!top) return ''
  return clamp(top.func + ' (' + top.loc + ')', MAX.culprit)
}

/**
 * Strips the parts of a filename that change without the code changing.
 *
 * A cache-busting query string or a content hash in a bundle name is different
 * on every deploy. Leaving them in would mean every release re-opened every
 * issue as brand new, which destroys the history that makes grouping worth
 * having.
 */
function normaliseFilename(loc) {
  return (
    String(loc)
      .split('?')[0]
      .split('#')[0]
      // `:line:col` goes first — the bundler-hash pattern below is anchored to
      // the end of the string, and would never match while a line number was
      // still trailing it.
      .replace(/:\d+(:\d+)?$/, '')
      // `main-a1b2c3d4.js` and `main.a1b2c3d4e5f6.js` both → `main.js`. Eight or
      // more hex characters, after a dash *or* a dot, before the extension.
      //
      // The dot form is webpack's and tsc's default and was missed until now,
      // which meant every webpack deploy re-opened every issue in the project:
      // the hash changes, so the filename changes, so the fingerprint changes,
      // so the issue is brand new.
      //
      // Still deliberately hex-only. Rollup and Vite emit base64-ish hashes
      // (`index-DiwrgTda.js`), and the pattern that would catch those —
      // "8+ alphanumerics" — also catches `main-controller.js`, merging two
      // unrelated files into one issue. Under-stripping leaves issues split,
      // which is visible and recoverable; over-stripping merges distinct bugs
      // into one row, which silently loses information. Symbolicated frames name
      // original source files and avoid the question entirely.
      .replace(/[-.][0-9a-f]{8,}(\.[a-z0-9]+)$/i, '$1')
  )
}

/**
 * The grouping key: what makes two events the same bug.
 *
 * This is the single most consequential rule in the product. Too loose and
 * unrelated failures merge into one unreadable issue; too tight and a crash
 * loop becomes ten thousand issues and the dashboard is a log tail again.
 *
 * The shape — exception type plus the top few frames, by function and file but
 * *not* line — is Sentry's, and it is Sentry's because it survives the things
 * that change without the bug changing: a reformat, an added import, a new
 * bundle hash.
 *
 * Changing this later splits or merges every issue's history. It is versioned
 * (`v1:`) so that a future rule can be introduced without pretending the old
 * groupings were computed the new way.
 */
function fingerprintOf(event) {
  const parts = []

  if (event.exception) {
    parts.push(event.exception.type)
    const frames = event.exception.frames || []
    for (let i = 0; i < frames.length && i < 3; i++) {
      parts.push(frames[i].func + '@' + normaliseFilename(frames[i].loc))
    }
    // A stack that parsed to nothing would otherwise group every exception of
    // the same type together, so the message stands in for the missing frames.
    if (frames.length === 0) parts.push(normaliseMessage(event.exception.value))
  } else {
    parts.push('message')
    parts.push(normaliseMessage(event.message))
  }

  return 'v1:' + $security.sha256(parts.join('|')).slice(0, 40)
}

/**
 * Collapses the parts of a message that vary per occurrence.
 *
 * "cache rebuilt in 412ms" and "cache rebuilt in 518ms" are one event type
 * reported twice, and treating them as two issues would make `captureMessage`
 * useless — every call would create a new row forever.
 */
function normaliseMessage(text) {
  return String(text || '')
    .replace(/\d+/g, 'N')
    .slice(0, 200)
}

/** 32 bits of the user identifier — see the seenUsers migration. */
function hashUser(user) {
  return $security.sha256(String(user)).slice(0, 8)
}

/**
 * Validates and normalises a raw request body.
 *
 * Returns a plain object with exactly the fields the issue columns need, all
 * clamped. Throws `reject(...)` with a status for anything it will not accept.
 */
function parseEvent(rawBody) {
  if (typeof rawBody !== 'string' || rawBody.length === 0) {
    throw reject(400, 'empty body')
  }
  if (rawBody.length > MAX_EVENT_BYTES) {
    throw reject(413, 'event too large')
  }

  let event
  try {
    event = JSON.parse(rawBody)
  } catch {
    throw reject(400, 'body is not JSON')
  }

  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw reject(400, 'body is not an event object')
  }
  if (SUPPORTED_VERSIONS.indexOf(event.v) === -1) {
    throw reject(400, 'unsupported payload version')
  }

  const exception = parseException(event.exception)
  const message = clamp(typeof event.message === 'string' ? event.message : '', MAX.title)

  // An event has to say *something*. One with neither is not a report, it is a
  // malformed request, and storing it would put a blank row on the dashboard.
  if (!exception && !message) {
    throw reject(400, 'event has neither an exception nor a message')
  }

  const title = exception ? clamp(exception.type + ': ' + exception.value, MAX.title) : message

  return {
    title,
    message,
    exception,
    frames: exception ? exception.frames : [],
    culprit: exception ? culpritOf(exception.frames) : '',
    level: oneOf(event.level, LEVELS, 'error'),
    environment: clamp(event.environment, MAX.environment),
    release: clamp(event.release, MAX.release),
    user: clamp(event.user, MAX.user),
    os: clamp(event.os, MAX.os),
    browser: clamp(event.browser, MAX.browser),
    runtime: clamp(event.runtime, MAX.runtime),
    // The reporting machine's clock, which may be wrong or hostile. Anything
    // unparseable, and anything in the future, becomes "now" — an issue dated
    // 2049 would sit at the top of the list forever.
    timestamp: parseTimestamp(event.timestamp),
  }
}

function parseException(raw) {
  if (!raw || typeof raw !== 'object') return null

  const type = clamp(typeof raw.type === 'string' && raw.type ? raw.type : 'Error', 120)
  const value = clamp(typeof raw.value === 'string' ? raw.value : '', MAX.title)

  return { type, value, frames: toDisplayFrames(raw.frames) }
}

function parseTimestamp(raw) {
  const now = new Date()
  if (typeof raw !== 'string') return now

  const at = new Date(raw)
  if (isNaN(at.getTime())) return now
  // A minute of tolerance for ordinary clock skew.
  if (at.getTime() > now.getTime() + 60000) return now
  return at
}

/**
 * Adds a user to an issue's bounded distinct-user set.
 *
 * Returns the new set and whether it grew, so the caller can keep `users` and
 * `seenUsers` consistent without recomputing the length.
 */
function withUser(seenUsers, user) {
  const set = asHashSet(seenUsers)
  if (!user) return { set: set, grew: false }
  if (set.length >= MAX_SEEN_USERS) return { set: set, grew: false }

  const hash = hashUser(user)
  if (set.indexOf(hash) !== -1) return { set: set, grew: false }

  return { set: set.concat([hash]), grew: true }
}

/**
 * Normalises whatever PocketBase hands back for a JSON column.
 *
 * This is the trap: `record.get()` does **not** return the array that was
 * stored. A JSON column reaches the JS VM as its raw bytes — an array of
 * character codes — which `Array.isArray` happily reports as an array. Treated
 * as the set, it grows by one element per byte, and `users` becomes the length
 * of the serialised JSON rather than a count of people.
 *
 * Accepts every shape it might arrive as: already-decoded strings, raw bytes, a
 * JSON string, or nothing.
 */
function asHashSet(value) {
  if (!value) return []

  if (Array.isArray(value)) {
    if (value.length === 0) return []
    // A set of hashes is strings; bytes are numbers. The distinction is the
    // whole point of this function.
    if (typeof value[0] === 'string') return value
    if (typeof value[0] === 'number') return parseHashes(bytesToString(value))
    return []
  }

  if (typeof value === 'string') return parseHashes(value)

  return []
}

function bytesToString(bytes) {
  let out = ''
  // Chunked rather than one spread: a full set serialises to several kilobytes,
  // and String.fromCharCode.apply has an argument-count ceiling well below that
  // on some engines.
  for (let i = 0; i < bytes.length; i += 1024) {
    out += String.fromCharCode.apply(null, bytes.slice(i, i + 1024))
  }
  return out
}

function parseHashes(text) {
  try {
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry) => typeof entry === 'string')
  } catch {
    // A column we cannot decode is not a reason to drop the report; the count
    // restarts rather than the event being lost.
    return []
  }
}

/**
 * Files an event against its issue, creating the issue the first time.
 *
 * The unique index on (stack, fingerprint) is what makes this safe under
 * concurrency: two events for a brand-new issue arriving together will both
 * miss the lookup, and the loser of the race gets a constraint violation rather
 * than a duplicate row. That is caught and retried as an update.
 */
function upsertIssue(app, stack, event) {
  const fingerprint = fingerprintOf(event)

  const existing = findIssue(app, stack.id, fingerprint)
  if (existing) return updateIssue(app, existing, event)

  try {
    return createIssue(app, stack, event, fingerprint)
  } catch (err) {
    const raced = findIssue(app, stack.id, fingerprint)
    if (!raced) throw err
    return updateIssue(app, raced, event)
  }
}

function findIssue(app, stackId, fingerprint) {
  try {
    return app.findFirstRecordByFilter(
      'issues',
      'stack = {:stack} && fingerprint = {:fingerprint}',
      { stack: stackId, fingerprint: fingerprint },
    )
  } catch {
    return null
  }
}

function createIssue(app, stack, event, fingerprint) {
  const collection = app.findCollectionByNameOrId('issues')
  const record = new Record(collection)

  const seen = withUser([], event.user)

  record.set('project', stack.getString('project'))
  record.set('stack', stack.id)
  record.set('fingerprint', fingerprint)
  record.set('title', event.title)
  record.set('culprit', event.culprit)
  record.set('level', event.level)
  record.set('status', 'unresolved')
  record.set('count', 1)
  record.set('users', seen.set.length)
  record.set('seenUsers', seen.set)
  record.set('firstSeen', event.timestamp)
  record.set('lastSeen', event.timestamp)
  record.set('environment', event.environment)
  record.set('release', event.release)
  record.set('user', event.user)
  record.set('os', event.os)
  record.set('browser', event.browser)
  record.set('runtime', event.runtime)
  record.set('frames', event.frames)

  app.save(record)
  return record
}

function updateIssue(app, record, event) {
  record.set('count', record.getInt('count') + 1)

  const seen = withUser(record.get('seenUsers'), event.user)
  if (seen.grew) {
    record.set('seenUsers', seen.set)
    record.set('users', seen.set.length)
  }

  // `lastSeen` only moves forward. Events can arrive out of order — a phone
  // that was offline flushes its queue on reconnect — and letting an old one
  // drag the timestamp backwards would push a live issue down the list.
  if (isOlderThanLastSeen(record, event)) {
    app.save(record)
    return record
  }

  record.set('lastSeen', event.timestamp)

  // The context fields describe where this is happening *now*, so the newest
  // event wins. Only non-empty values overwrite: a report that omitted the
  // release should not erase the release we already knew.
  const context = ['environment', 'release', 'user', 'os', 'browser', 'runtime']
  for (let i = 0; i < context.length; i++) {
    if (event[context[i]]) record.set(context[i], event[context[i]])
  }

  // Frames and culprit follow the same rule, so an issue always shows a stack
  // trace if any of its events had one.
  if (event.frames.length) {
    record.set('frames', event.frames)
    record.set('culprit', event.culprit)
  }

  // A resolved issue that happens again is a regression, and silently leaving
  // it resolved is how a bug gets closed twice and fixed never. `ignored` is
  // deliberately not reopened — being told about it again is exactly what the
  // reader asked not to happen.
  if (record.getString('status') === 'resolved') record.set('status', 'unresolved')

  app.save(record)
  return record
}

function isOlderThanLastSeen(record, event) {
  try {
    const lastSeen = record.getDateTime('lastSeen')
    if (lastSeen.isZero()) return false
    return event.timestamp.getTime() < lastSeen.time().getTime()
  } catch {
    // A column we cannot read is not a reason to drop a report.
    return false
  }
}

module.exports = {
  MAX_EVENT_BYTES,
  MAX_SEEN_USERS,
  SUPPORTED_VERSIONS,
  clamp,
  culpritOf,
  fingerprintOf,
  hashUser,
  normaliseFilename,
  normaliseMessage,
  parseEvent,
  reject,
  toDisplayFrames,
  upsertIssue,
  withUser,
  asHashSet,
}
