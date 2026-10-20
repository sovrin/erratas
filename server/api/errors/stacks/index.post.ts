import { getProject } from '#nexitas/server/core/projects'
import { announceChange } from '#nexitas/server/utils/changes'
import { invalid } from '#nexitas/server/utils/invalid'
import { nexitasDatabase } from '#nexitas/server/utils/nexitas'
import { newStackSchema } from '../../../../shared/contracts'
import { createStack } from '../../../core/issues'

/** A new stack for a project, with its own DSN. */
export default defineEventHandler(async (event) => {
  const body = newStackSchema.safeParse(await readBody(event))
  if (!body.success) throw invalid(body.error)
  const db = nexitasDatabase()
  if (!getProject(db, body.data.projectId))
    throw createError({ statusCode: 404, statusMessage: 'There is no such project.' })
  const stack = createStack(db, body.data.projectId, body.data)
  announceChange()
  setResponseStatus(event, 201)
  return stack
})
