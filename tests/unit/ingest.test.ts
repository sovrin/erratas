import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from '#nexitas/server/core/database'
import { createProject, deleteProject } from '#nexitas/server/core/projects'
import {
  IngestError,
  MAX_EVENT_BYTES,
  fingerprintOf,
  normaliseFilename,
  parseEvent,
} from '../../server/core/ingest'
import {
  countUnresolved,
  createStack,
  deleteIssue,
  deleteStack,
  getIssue,
  listIssues,
  recordEvent,
  setIssueStatus,
} from '../../server/core/issues'
import { erratas } from '../../server/core/module'

const NOW = Date.parse('2026-08-18T12:00:00.000Z')

const anEvent = (overrides: Record<string, unknown> = {}) => ({
  v: 1,
  level: 'error',
  exception: {
    type: 'TypeError',
    value: "Cannot read properties of undefined (reading 'map')",
    frames: [
      {
        filename: 'https://app.example/main.js',
        function: 'renderUserList',
        lineno: 42,
        colno: 18,
      },
    ],
  },
  ...overrides,
})

const parse = (raw: object) => parseEvent(JSON.stringify(raw), NOW)
const fingerprint = (raw: object) => fingerprintOf(parse(raw))
const thrownFrom = (filename: string, func = 'renderUserList', lineno = 42) =>
  anEvent({
    exception: {
      type: 'TypeError',
      value: "Cannot read properties of undefined (reading 'map')",
      frames: [{ filename, function: func, lineno }],
    },
  })

describe('parseEvent', () => {
  it('normalises a well-formed event', () => {
    const event = parse(anEvent({ environment: 'production' }))
    expect(event).toMatchObject({
      title: "TypeError: Cannot read properties of undefined (reading 'map')",
      culprit: 'renderUserList (https://app.example/main.js:42:18)',
      level: 'error',
      environment: 'production',
      frames: [{ func: 'renderUserList', loc: 'https://app.example/main.js:42:18' }],
    })
  })

  it.each([
    ['', 'empty body'],
    ['not json', 'body is not JSON'],
    ['[]', 'body is not an event object'],
    ['null', 'body is not an event object'],
    ['{"v":99}', 'unsupported payload version'],
    ['{"v":1}', 'event has neither an exception nor a message'],
  ])('refuses %s with a 400', (body, message) => {
    expect(() => parseEvent(body)).toThrow(message)
    expect(() => parseEvent(body)).toThrow(expect.objectContaining({ status: 400 }))
  })

  it('refuses an oversized body before parsing it, with a 413', () => {
    expect(() => parseEvent('x'.repeat(MAX_EVENT_BYTES + 1))).toThrow(
      new IngestError(413, 'event too large'),
    )
  })

  // Shapes a hostile or broken client can send; none may reach a column as they are.
  it.each([
    ['frames as a number', { frames: 42 }],
    ['frames as a string', { frames: 'boom' }],
    ['frames of nulls', { frames: [null, null, 3] }],
    ['a frame with no fields', { frames: [{}] }],
  ])('survives %s', (_label, exception) => {
    const event = parse(anEvent({ exception: { type: 'Error', value: 'x', ...exception } }))
    expect(Array.isArray(event.frames)).toBe(true)
  })

  it('clamps strings and caps frames and source lines', () => {
    const event = parse(
      anEvent({
        environment: 'e'.repeat(500),
        release: 'r'.repeat(500),
        exception: {
          type: 'Error',
          value: 'v'.repeat(5000),
          frames: Array.from({ length: 500 }, (_, i) => ({
            function: `f${i}`,
            code: i ? [] : Array.from({ length: 50 }, (_, n) => ({ n, text: 'x'.repeat(900) })),
          })),
        },
      }),
    )
    expect(event.environment).toHaveLength(60)
    expect(event.release).toHaveLength(60)
    expect(event.title).toHaveLength(500)
    expect(event.frames).toHaveLength(50)
    expect(event.frames[0]!.code).toHaveLength(20)
    expect(event.frames[0]!.code![0]!.text).toHaveLength(400)
  })

  it('accepts a message-only event, and an unknown level as error', () => {
    expect(parse({ v: 1, level: 'info', message: 'cache rebuilt' })).toMatchObject({
      title: 'cache rebuilt',
      exception: null,
      level: 'info',
    })
    expect(parse(anEvent({ level: 'catastrophe' })).level).toBe('error')
  })

  // A machine reporting from 2049 would top the list forever.
  it.each([new Date(NOW + 86_400_000).toISOString(), 'not-a-date', 42, null])(
    'takes now for the timestamp %s',
    (timestamp) => {
      expect(parse(anEvent({ timestamp })).timestamp).toBe(NOW)
    },
  )

  it('keeps a past timestamp', () => {
    expect(parse(anEvent({ timestamp: '2026-08-18T11:00:00.000Z' })).timestamp).toBe(
      NOW - 3_600_000,
    )
  })
})

describe('fingerprintOf', () => {
  it('groups two occurrences of the same bug, versioned', () => {
    expect(fingerprint(anEvent())).toBe(fingerprint(anEvent()))
    expect(fingerprint(anEvent())).toMatch(/^v1:.{40}$/)
  })

  // What changes with a build but not with the bug must not open a new issue.
  it.each([
    ['a moved line', thrownFrom('https://app.example/main.js', 'renderUserList', 84)],
    ['a content hash', thrownFrom('https://app.example/main-9f3a1c7e.js')],
    ['a cache-busting query', thrownFrom('https://app.example/main.js?v=99')],
  ])('ignores %s', (_label, event) => {
    expect(fingerprint(event)).toBe(fingerprint(thrownFrom('https://app.example/main.js')))
  })

  it.each([
    ['another function', thrownFrom('https://app.example/main.js', 'renderInvoice')],
    ['another file', thrownFrom('https://app.example/other.js')],
    ['another type', anEvent({ exception: { ...anEvent().exception, type: 'RangeError' } })],
  ])('separates %s', (_label, event) => {
    expect(fingerprint(event)).not.toBe(fingerprint(anEvent()))
  })

  // With no frames, the message is all there is; otherwise every error of a type is one issue.
  it('falls back to the message when a stack did not parse', () => {
    const failing = (value: string) => anEvent({ exception: { type: 'Error', value, frames: [] } })
    expect(fingerprint(failing('database is down'))).not.toBe(fingerprint(failing('disk full')))
  })

  it('groups messages that differ only by numbers', () => {
    expect(fingerprint({ v: 1, message: 'rebuilt in 412ms' })).toBe(
      fingerprint({ v: 1, message: 'rebuilt in 518ms' }),
    )
    expect(fingerprint({ v: 1, message: 'cache rebuilt' })).not.toBe(
      fingerprint({ v: 1, message: 'cache corrupted' }),
    )
  })
})

describe('normaliseFilename', () => {
  it.each([
    ['/assets/main-a1b2c3d4.js', '/assets/main.js'],
    ['/assets/main.a1b2c3d4e5f6.js', '/assets/main.js'],
    ['/static/chunks/main-app-0123456789ab.js', '/static/chunks/main-app.js'],
    ['/app.js?v=42', '/app.js'],
    ['/app.js#frag', '/app.js'],
    ['/assets/main-a1b2c3d4.js:1:48213', '/assets/main.js'],
  ])('strips %s', (input, expected) => {
    expect(normaliseFilename(input)).toBe(expected)
  })

  // Words, not hashes: stripping them would merge unrelated files into one issue.
  it.each(['/src/main-controller.js', '/src/user.service.js', '/src/main-abc123.js'])(
    'leaves %s alone',
    (input) => {
      expect(normaliseFilename(input)).toBe(input)
    },
  )
})

describe('recordEvent', () => {
  const dirs: string[] = []
  const dbs: DatabaseSync[] = []
  afterEach(() => {
    for (const db of dbs.splice(0)) if (db.isOpen) db.close()
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  function setup() {
    const dir = mkdtempSync(join(tmpdir(), 'erratas-test-'))
    dirs.push(dir)
    const db = openDatabase(join(dir, 'test.sqlite'), [erratas])
    dbs.push(db)
    createProject(db, { id: 'sonotas', name: 'sonotas', origins: ['https://sonotas.example'] })
    const stack = createStack(db, 'sonotas', { name: 'frontend', platform: 'browser' })
    const record = (raw: object, now = NOW) =>
      recordEvent(db, stack.id, parseEvent(JSON.stringify(raw), now))
    return { db, stack, record }
  }

  it('opens an issue once and counts the rest', () => {
    const { db, stack, record } = setup()
    const id = record(anEvent({ environment: 'production', release: 'v1' }))
    expect(record(anEvent(), NOW + 1000)).toBe(id)
    expect(record(thrownFrom('https://app.example/other.js'))).not.toBe(id)
    expect(getIssue(db, 'sonotas', id)).toMatchObject({
      stackName: 'frontend',
      count: 2,
      status: 'unresolved',
      firstSeen: NOW,
      lastSeen: NOW + 1000,
      // A report without them does not erase what was known.
      environment: 'production',
      release: 'v1',
    })
    expect(stack.publicKey).toMatch(/^[0-9a-f]{32}$/)
    expect(listIssues(db, 'sonotas')).toHaveLength(2)
  })

  // An offline client flushing its queue must not drag a live issue back in time.
  it('never moves lastSeen back, but still counts an old event', () => {
    const { db, record } = setup()
    const id = record(anEvent({ release: 'v2' }))
    record(anEvent({ release: 'v1', timestamp: '2026-08-01T00:00:00.000Z' }))
    expect(getIssue(db, 'sonotas', id)).toMatchObject({ count: 2, lastSeen: NOW, release: 'v2' })
  })

  it('keeps the last stack trace when a report has none', () => {
    const { db, record } = setup()
    const id = record({ v: 1, message: 'boom' })
    expect(getIssue(db, 'sonotas', id)!.frames).toEqual([])
    const traced = record(anEvent())
    expect(getIssue(db, 'sonotas', traced)!.frames).toHaveLength(1)
  })

  it('reopens a resolved issue that recurs, but not an ignored one', () => {
    const { db, record } = setup()
    const resolved = record(anEvent())
    setIssueStatus(db, 'sonotas', resolved, 'resolved')
    record(anEvent(), NOW + 1000)
    expect(getIssue(db, 'sonotas', resolved)!.status).toBe('unresolved')

    const ignored = record({ v: 1, message: 'noise' })
    setIssueStatus(db, 'sonotas', ignored, 'ignored')
    record({ v: 1, message: 'noise' }, NOW + 1000)
    expect(getIssue(db, 'sonotas', ignored)!.status).toBe('ignored')
    expect(countUnresolved(db, 'sonotas')).toBe(1)
  })

  // Every read and write of one issue or stack is the project's: another's is not found.
  it("keeps one project out of another's issues and stacks", () => {
    const { db, stack, record } = setup()
    const id = record(anEvent())
    createProject(db, { id: 'other', name: 'other', origins: [] })
    expect(getIssue(db, 'other', id)).toBeNull()
    setIssueStatus(db, 'other', id, 'resolved')
    deleteIssue(db, 'other', id)
    expect(deleteStack(db, 'other', stack.id)).toBe(false)
    expect(getIssue(db, 'sonotas', id)!.status).toBe('unresolved')
  })

  it('goes with its project', () => {
    const { db, record } = setup()
    record(anEvent())
    deleteProject(db, 'sonotas', [erratas])
    expect(listIssues(db, 'sonotas')).toEqual([])
    expect(countUnresolved(db, 'sonotas')).toBe(0)
  })
})
