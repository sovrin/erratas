import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { withSourceContext } from '../src/node/sourceContext'
import { PAYLOAD_VERSION, type ErratasEvent, type StackFrame } from '../src/types'

/**
 * These run against real files rather than a mocked `fs`.
 *
 * The interesting failures here are all about what a stack frame's `filename`
 * can actually be — a `file://` URL, a Node internal, a path that no longer
 * exists — and a mock would only ever return what the test told it to, which
 * proves nothing about any of that.
 */

const SOURCE = [
  'export class UserRepository {', // 1
  '  create(data) {', // 2
  '    return User.query().create(data)', // 3
  '  }', // 4
  '}', // 5
].join('\n')

let dir: string
let file: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'erratas-src-'))
  file = join(dir, 'UserRepository.js')
  writeFileSync(file, SOURCE, 'utf8')
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

function anEvent(frames: StackFrame[]): ErratasEvent {
  return {
    v: PAYLOAD_VERSION,
    event_id: 'a'.repeat(32),
    timestamp: '2026-08-16T00:00:00.000Z',
    level: 'error',
    platform: 'javascript',
    sdk: { name: 'erratas', version: '0.0.0' },
    exception: { type: 'TypeError', value: 'boom', frames },
  }
}

describe('withSourceContext', () => {
  it('attaches the window around the frame, marking the offending line', () => {
    const result = withSourceContext({ before: 1, after: 1 })(
      anEvent([{ filename: file, lineno: 3, colno: 12, function: 'create' }]),
    )

    const code = result.exception!.frames[0]!.code!
    expect(code.map((line) => line.n)).toEqual([2, 3, 4])
    expect(code.find((line) => line.err)?.text).toBe('    return User.query().create(data)')
  })

  it('only reaches the top few frames', () => {
    // Context for all fifty frames would spend most of the payload budget on
    // frames nobody scrolls to.
    const frames = Array.from({ length: 5 }, () => ({ filename: file, lineno: 3 }))

    const result = withSourceContext({ frames: 2 })(anEvent(frames))

    expect(result.exception!.frames.map((f) => f.code !== undefined)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ])
  })

  it('reads a frame given as a file:// URL, as ESM stacks are', () => {
    const result = withSourceContext()(anEvent([{ filename: pathToFileURL(file).href, lineno: 1 }]))

    expect(result.exception!.frames[0]!.code?.[0]!.text).toBe('export class UserRepository {')
  })

  it('leaves frames alone when there is no file to read', () => {
    const result = withSourceContext()(
      anEvent([
        { filename: 'node:internal/process/task_queues', lineno: 95 },
        { filename: join(dir, 'deleted.js'), lineno: 1 },
        { filename: '<anonymous>', lineno: 1 },
        { filename: 'relative/path.js', lineno: 1 },
      ]),
    )

    expect(result.exception!.frames.every((frame) => frame.code === undefined)).toBe(true)
  })

  it('returns the very same event when nothing could be attached', () => {
    // Identity, not just equality: an untouched event should not churn through
    // whatever hook runs next.
    const event = anEvent([{ filename: 'node:fs', lineno: 1 }])

    expect(withSourceContext()(event)).toBe(event)
  })

  it('does not mutate the event it was given', () => {
    // beforeSend hooks compose; one that edits in place makes their order
    // matter invisibly.
    const event = anEvent([{ filename: file, lineno: 3 }])

    const result = withSourceContext()(event)

    expect(event.exception!.frames[0]!.code).toBeUndefined()
    expect(result).not.toBe(event)
    expect(result.exception!.frames[0]!.code).toBeDefined()
  })

  it('passes through events with no exception or no frames', () => {
    const message: ErratasEvent = { ...anEvent([]), exception: undefined, message: 'hello' }

    expect(withSourceContext()(message)).toBe(message)
    const empty = anEvent([])
    expect(withSourceContext()(empty)).toBe(empty)
  })

  it('reads each file once', () => {
    // Proven without mocking fs: the file is removed after the first call, so
    // only a cached read can still produce code on the second.
    const scratch = join(dir, 'transient.js')
    writeFileSync(scratch, SOURCE, 'utf8')
    const hook = withSourceContext()

    expect(
      hook(anEvent([{ filename: scratch, lineno: 3 }])).exception!.frames[0]!.code,
    ).toBeDefined()
    rmSync(scratch)
    expect(
      hook(anEvent([{ filename: scratch, lineno: 3 }])).exception!.frames[0]!.code,
    ).toBeDefined()

    // And a fresh hook, with a cold cache, correctly finds nothing.
    expect(
      withSourceContext()(anEvent([{ filename: scratch, lineno: 3 }])).exception!.frames[0]!.code,
    ).toBeUndefined()
  })

  it('survives frames that are the wrong shape entirely', () => {
    // This runs inside an app that is already failing. It may return less; it
    // may never throw.
    const frames = [
      { filename: file },
      { lineno: 3 },
      { filename: file, lineno: -1 },
      { filename: file, lineno: 9999 },
      {},
    ] as StackFrame[]

    expect(() => withSourceContext()(anEvent(frames))).not.toThrow()
  })
})
