import { announceChange } from '#nexitas/server/utils/changes'
import { invalid } from '#nexitas/server/utils/invalid'
import { nexitasDatabase } from '#nexitas/server/utils/nexitas'
import { requestProject } from '#nexitas/server/utils/projects'
import { issueStatusSchema } from '#self/shared/contracts'
import { getIssue, setIssueStatus } from '#self/server/core/issues'
import { routeIssue } from '#self/server/utils/erratas'

/** Resolves, ignores or reopens an issue. */
export default defineEventHandler(async (event) => {
  const project = requestProject(event).id
  const issue = routeIssue(event)
  const body = issueStatusSchema.safeParse(await readBody(event))
  if (!body.success) throw invalid(body.error)
  const db = nexitasDatabase()
  setIssueStatus(db, project, issue.id, body.data.status)
  announceChange()
  return getIssue(db, project, issue.id)
})
