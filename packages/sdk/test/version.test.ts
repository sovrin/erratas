import { describe, expect, it } from 'vitest'

import pkg from '../package.json'
import { SDK_VERSION } from '../src/version'

// SDK_VERSION is inlined rather than imported from package.json, because a JSON
// import does not survive every consumer's bundler. Importing it *here* is fine
// — a test is never shipped — and this is what keeps the two from drifting
// apart: the version travels in every event payload, and a wrong one makes
// "which SDK version sends this bad field" unanswerable.
describe('SDK_VERSION', () => {
  it('matches package.json', () => {
    expect(SDK_VERSION).toBe(pkg.version)
  })
})
