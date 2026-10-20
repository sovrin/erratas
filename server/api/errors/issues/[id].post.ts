import { announceChange } from '#nexitas/server/utils/changes'
import { invalid } from '#nexitas/server/utils/invalid'
import { nexitasDatabase } from '#nexitas/server/utils/nexitas'
import { issueStatusSchema } from '../../../../shared/contracts'
import { getIssue, setIssueStatus } from '../../../core/issues'
import { routeIssue } from '../../../utils/erratas'

/** Resolves, ignores or reopens an issue. */
export default defineEventHandler(async (event) => {
  const issue = routeIssue(event)
  const body = issueStatusSchema.safeParse(await readBody(event))
  if (!body.success) throw invalid(body.error)
  const db = nexitasDatabase()
  setIssueStatus(db, issue.id, body.data.status)
  announceChange()
  return getIssue(db, issue.id)
})
