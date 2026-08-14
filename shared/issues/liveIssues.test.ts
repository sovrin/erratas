import { describe, expect, it } from 'vitest'

import { anIssue } from '../test/fixtures'
import { applyIssueChanges, type IssueChange } from './liveIssues'

/**
 * These cases pin the merge rules, not the transport. Every one of them is a way
 * the list can end up lying to somebody — a duplicated row, a bug that never
 * appears, a resolved issue that comes back — and each is cheap to reintroduce
 * by "simplifying" the switch in `applyIssueChanges`.
 */

const update = (issue: ReturnType<typeof anIssue>): IssueChange => ({ action: 'update', issue })
const create = (issue: ReturnType<typeof anIssue>): IssueChange => ({ action: 'create', issue })
const remove = (issue: ReturnType<typeof anIssue>): IssueChange => ({ action: 'delete', issue })

describe('applyIssueChanges', () => {
  it('replaces a loaded issue with the state that arrived', () => {
    const loaded = [anIssue({ id: 'a', count: 10 })]

    const result = applyIssueChanges(loaded, [update(anIssue({ id: 'a', count: 11 }))], 'p1')

    expect(result).toHaveLength(1)
    expect(result[0]!.count).toBe(11)
  })

  it('inserts an issue an update refers to but the list has never seen', () => {
    // Ingest upserts, so the second event for a new bug is an update. A
    // dashboard that connected between the two events must still show it.
    const result = applyIssueChanges([], [update(anIssue({ id: 'new' }))], 'p1')

    expect(result.map((issue) => issue.id)).toEqual(['new'])
  })

  it('does not duplicate a row when a create arrives for an issue already loaded', () => {
    // The initial read and the stream race; both can carry the same brand-new
    // issue.
    const loaded = [anIssue({ id: 'a', count: 1 })]

    const result = applyIssueChanges(loaded, [create(anIssue({ id: 'a', count: 2 }))], 'p1')

    expect(result).toHaveLength(1)
    expect(result[0]!.count).toBe(2)
  })

  it('removes a deleted issue and ignores a delete it never had', () => {
    const loaded = [anIssue({ id: 'a' }), anIssue({ id: 'b' })]

    expect(
      applyIssueChanges(loaded, [remove(anIssue({ id: 'a' }))], 'p1').map((i) => i.id),
    ).toEqual(['b'])
    expect(applyIssueChanges(loaded, [remove(anIssue({ id: 'zz' }))], 'p1')).toBe(loaded)
  })

  it('converges on the last change when one issue changes several times', () => {
    const loaded = [anIssue({ id: 'a', count: 1 })]

    const result = applyIssueChanges(
      loaded,
      [
        update(anIssue({ id: 'a', count: 2 })),
        update(anIssue({ id: 'a', count: 3 })),
        update(anIssue({ id: 'a', count: 4 })),
      ],
      'p1',
    )

    expect(result).toHaveLength(1)
    expect(result[0]!.count).toBe(4)
  })

  it('applies a create then a delete for the same issue as a no-op', () => {
    const result = applyIssueChanges(
      [anIssue({ id: 'a' })],
      [create(anIssue({ id: 'b' })), remove(anIssue({ id: 'b' }))],
      'p1',
    )

    expect(result.map((issue) => issue.id)).toEqual(['a'])
  })

  it('drops changes belonging to another project', () => {
    // The subscription is filtered server-side, but unsubscribing on a project
    // switch is asynchronous and one more message can land after it.
    const loaded = [anIssue({ id: 'a', projectId: 'p1' })]

    const result = applyIssueChanges(loaded, [update(anIssue({ id: 'x', projectId: 'p2' }))], 'p1')

    expect(result).toBe(loaded)
  })

  it('drops everything when no project is open', () => {
    const result = applyIssueChanges([], [update(anIssue({ id: 'a' }))], null)

    expect(result).toEqual([])
  })

  it('ignores an action it does not recognise', () => {
    const loaded = [anIssue({ id: 'a' })]
    const bogus = { action: 'reticulate', issue: anIssue({ id: 'b' }) } as unknown as IssueChange

    expect(applyIssueChanges(loaded, [bogus], 'p1')).toBe(loaded)
  })

  it('returns the same array when no change applied, so nothing above re-renders', () => {
    const loaded = [anIssue({ id: 'a' })]

    expect(applyIssueChanges(loaded, [], 'p1')).toBe(loaded)
  })

  it('leaves the input array untouched', () => {
    const loaded = [anIssue({ id: 'a', count: 1 })]

    applyIssueChanges(
      loaded,
      [update(anIssue({ id: 'a', count: 99 })), create(anIssue({ id: 'b' }))],
      'p1',
    )

    expect(loaded).toHaveLength(1)
    expect(loaded[0]!.count).toBe(1)
  })
})
