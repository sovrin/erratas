import { nexitasDatabase } from '#nexitas/server/utils/nexitas'
import { listStacks } from '../../../core/issues'

// A project's stacks, for its panel on the project's page.
export default defineEventHandler((event) => {
  const project = getQuery(event).project
  if (typeof project !== 'string')
    throw createError({ statusCode: 400, statusMessage: 'Name the project.' })
  return listStacks(nexitasDatabase(), project)
})
