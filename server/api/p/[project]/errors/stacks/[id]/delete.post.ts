import { announceChange } from '#nexitas/server/utils/changes'
import { nexitasDatabase } from '#nexitas/server/utils/nexitas'
import { requestProject } from '#nexitas/server/utils/projects'
import { deleteStack } from '../../../../../../core/issues'

/** Deletes a stack and its issues; apps reporting with its DSN get a 401 from then on. */
export default defineEventHandler((event) => {
  if (!deleteStack(nexitasDatabase(), requestProject(event).id, getRouterParam(event, 'id') ?? ''))
    throw createError({ statusCode: 404, statusMessage: 'There is no such stack.' })
  announceChange()
  return { ok: true }
})
