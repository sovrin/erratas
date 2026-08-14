import type { Issue } from '../domain/types'
import type { TagContext } from '../search/tagResolvers'

/**
 * Test data for the pure layer.
 *
 * Lives beside the code it exercises rather than in each test file, because
 * every test of filtering, search or pagination needs the same shape and
 * re-declaring it per file is how the cases quietly stop describing the same
 * thing.
 */
export function anIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'i1',
    projectId: 'p1',
    stackId: 'frontend',
    fingerprint: 'fp1',
    title: "TypeError: Cannot read properties of undefined (reading 'map')",
    culprit: 'renderUserList (src/components/UserList.vue:42)',
    level: 'error',
    status: 'unresolved',
    count: 1284,
    users: 340,
    firstSeen: '2026-08-05T12:00:00.000Z',
    lastSeen: '2026-08-14T11:48:00.000Z',
    environment: 'production',
    release: 'v2.4.1',
    user: 'lea@quant.fm',
    os: 'macOS 14',
    browser: 'Chrome 128',
    runtime: 'Chrome 128 · macOS 14',
    frames: [],
    ...overrides,
  }
}

/** Stack ids double as their names in tests — one less indirection to read past. */
export const TEST_TAG_CONTEXT: TagContext = {
  stackName: (stackId) => stackId,
}
