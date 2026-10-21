import { announceChange } from '#nexitas/server/utils/changes'
import { nexitasDatabase } from '#nexitas/server/utils/nexitas'
import { requestProject } from '#nexitas/server/utils/projects'
import { deleteIssue } from '../../../../../../core/issues'
import { routeIssue } from '../../../../../../utils/erratas'

export default defineEventHandler((event) => {
  deleteIssue(nexitasDatabase(), requestProject(event).id, routeIssue(event).id)
  announceChange()
  return { ok: true }
})
