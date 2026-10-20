import { announceChange } from '#nexitas/server/utils/changes'
import { nexitasDatabase } from '#nexitas/server/utils/nexitas'
import { deleteIssue } from '../../../../core/issues'
import { routeIssue } from '../../../../utils/erratas'

export default defineEventHandler((event) => {
  deleteIssue(nexitasDatabase(), routeIssue(event).id)
  announceChange()
  return { ok: true }
})
