import { announceChange } from '#nexitas/server/utils/changes'
import { invalid } from '#nexitas/server/utils/invalid'
import { nexitasDatabase } from '#nexitas/server/utils/nexitas'
import { requestProject } from '#nexitas/server/utils/projects'
import { newStackSchema } from '../../../../../../shared/contracts'
import { createStack } from '../../../../../core/issues'

/** A new stack for a project, with its own DSN. */
export default defineEventHandler(async (event) => {
  const project = requestProject(event)
  const body = newStackSchema.safeParse(await readBody(event))
  if (!body.success) throw invalid(body.error)
  const stack = createStack(nexitasDatabase(), project.id, body.data)
  announceChange()
  setResponseStatus(event, 201)
  return stack
})
