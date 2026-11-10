import { nexitasDatabase } from '#nexitas/server/utils/nexitas'
import { requestProject } from '#nexitas/server/utils/projects'
import { listStacks } from '#self/server/core/issues'

// A project's stacks, for the Errors page's setup.
export default defineEventHandler((event) =>
  listStacks(nexitasDatabase(), requestProject(event).id),
)
