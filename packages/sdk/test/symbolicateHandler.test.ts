import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createSymbolicateHandler, createSymbolicateResolver } from '../src/node/symbolicate'

/**
 * The handler is a security boundary: it takes a filename from whoever is
 * calling and answers with source. Half of these cases are about what it must
 * refuse, and those are the ones that must not be "simplified" away later.
 *
 * `mappings: 'AAEA'` is one segment — generated (0,0) maps to source 0, original
 * line 2 zero-based, so line 3.
 */

const ORIGINAL = ['const a = 1', 'const b = 2', 'throw new Error("boom")', 'const c = 3'].join('\n')
const SECRET = 'DATABASE_PASSWORD=hunter2'

let dir: string
let root: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'erratas-handler-'))
  root = join(dir, 'public', 'assets')
  mkdirSync(root, { recursive: true })

  // A bundle plus its map, as a build would emit them.
  writeFileSync(join(root, 'app-a1b2c3d4.js'), 'x'.repeat(600))
  writeFileSync(
    join(root, 'app-a1b2c3d4.js.map'),
    JSON.stringify({
      version: 3,
      sources: ['../src/UserRepository.ts'],
      sourcesContent: [ORIGINAL],
      names: [],
      mappings: 'AAEA',
    }),
  )

  // Two things that must stay unreachable: a secret outside the root, and a
  // plain file inside it that is not a built asset.
  writeFileSync(join(dir, '.env'), SECRET)
  writeFileSync(join(root, 'notes.txt'), SECRET)
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

const resolver = () => createSymbolicateResolver({ root, basePath: '/assets' })

describe('createSymbolicateResolver', () => {
  it('turns a minified browser frame into original source', () => {
    const [frame] = resolver()([
      { filename: 'https://app.example.com/assets/app-a1b2c3d4.js', lineno: 1, colno: 1 },
    ])

    expect(frame).toMatchObject({ filename: 'src/UserRepository.ts', lineno: 3 })
    expect(frame!.code.find((line) => line.err)?.text).toBe('throw new Error("boom")')
  })

  it('ignores the query string a cache-buster adds', () => {
    const [frame] = resolver()([
      { filename: 'https://app.example.com/assets/app-a1b2c3d4.js?v=9', lineno: 1, colno: 1 },
    ])

    expect(frame).not.toBeNull()
  })

  it('refuses to escape the root, however the path is dressed up', () => {
    const escapes = [
      'https://app.example.com/assets/../.env',
      'https://app.example.com/assets/../../.env',
      'https://app.example.com/assets/%2e%2e/.env',
      'https://app.example.com/assets/..%2f.env',
      '/assets/../.env',
      'file:///etc/passwd',
    ]

    for (const filename of escapes) {
      expect(resolver()([{ filename, lineno: 1, colno: 1 }])[0], filename).toBeNull()
    }
  })

  it('will not read a file inside the root that has no source map', () => {
    // The second barrier: even fully contained, a path only yields source if it
    // is a built asset with a map. Contents are never read from the file itself.
    const [frame] = resolver()([
      { filename: 'https://app.example.com/assets/notes.txt', lineno: 1, colno: 1 },
    ])

    expect(frame).toBeNull()
  })

  it('refuses a path outside the configured basePath', () => {
    const [frame] = resolver()([
      { filename: 'https://app.example.com/other/app-a1b2c3d4.js', lineno: 1, colno: 1 },
    ])

    expect(frame).toBeNull()
  })

  it('refuses a NUL byte', () => {
    const [frame] = resolver()([{ filename: '/assets/app-a1b2c3d4.js\0.png', lineno: 1, colno: 1 }])

    expect(frame).toBeNull()
  })

  it('answers positionally, so a refusal does not shift its neighbours', () => {
    const frames = resolver()([
      { filename: '/assets/../.env', lineno: 1, colno: 1 },
      { filename: '/assets/app-a1b2c3d4.js', lineno: 1, colno: 1 },
    ])

    expect(frames).toHaveLength(2)
    expect(frames[0]).toBeNull()
    expect(frames[1]).not.toBeNull()
  })

  it('answers at most three frames', () => {
    const many = Array.from({ length: 10 }, () => ({
      filename: '/assets/app-a1b2c3d4.js',
      lineno: 1,
      colno: 1,
    }))

    expect(resolver()(many)).toHaveLength(3)
  })

  it('survives frames of the wrong shape', () => {
    const junk = [
      { filename: 123, lineno: 1 },
      { filename: '/assets/app-a1b2c3d4.js' },
      { filename: '/assets/app-a1b2c3d4.js', lineno: Number.NaN },
      null,
    ] as never

    expect(() => resolver()(junk)).not.toThrow()
    expect(resolver()(junk).every((frame) => frame === null)).toBe(true)
  })
})

describe('createSymbolicateHandler', () => {
  const handler = () => createSymbolicateHandler({ root, basePath: '/assets' })

  const post = (body: unknown) =>
    new Request('http://localhost/__erratas/symbolicate', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })

  it('answers a well-formed request', async () => {
    const response = await handler()(
      post({ frames: [{ filename: '/assets/app-a1b2c3d4.js', lineno: 1, colno: 1 }] }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = (await response.json()) as { frames: { filename: string }[] }
    expect(body.frames[0]!.filename).toBe('src/UserRepository.ts')
  })

  it('rejects anything malformed as 4xx, never 5xx', async () => {
    // A 5xx is the one status an SDK might read as worth retrying, and retrying
    // a malformed body loops forever.
    for (const body of ['not json', {}, { frames: 'nope' }]) {
      expect((await handler()(post(body))).status).toBe(400)
    }
    expect((await handler()(new Request('http://localhost/__erratas/symbolicate'))).status).toBe(
      405,
    )
  })
})
