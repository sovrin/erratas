import { describe, expect, it } from 'vitest'

import { testEventCommand } from './testCommand'

const url = 'https://erratas.sh/api/pbc3f9x2k1m4n5o/store/?erratas_key=8f2ac1e9b7d4'

describe('testEventCommand', () => {
  it('posts to the ingest url it was given', () => {
    expect(testEventCommand(url)).toContain(`'${url}'`)
    expect(testEventCommand(url)).toContain('-X POST')
  })

  it('labels the body text/plain', () => {
    // Any other content type makes the SDK's own cross-origin POST non-simple, so
    // a command that used application/json would be testing a different request
    // than the one being debugged.
    expect(testEventCommand(url)).toContain("-H 'content-type: text/plain'")
    expect(testEventCommand(url)).not.toContain('application/json')
  })

  it('sends a body ingest will accept', () => {
    const body = testEventCommand(url).match(/-d '(.+)'/)?.[1]
    expect(body).toBeDefined()

    const event = JSON.parse(body!) as { v: number; message?: string; exception?: unknown }
    // parseEvent refuses an unknown version, and refuses an event carrying
    // neither an exception nor a message.
    expect(event.v).toBe(1)
    expect(event.message).toBeTruthy()
  })

  it('quotes the url so a shell does not eat the query string', () => {
    // Unquoted, `?` and `&` are glob and job-control characters — the command
    // would either fail or silently post to the wrong URL.
    expect(testEventCommand(url)).not.toMatch(/[^']https:\/\//)
  })
})
