import { nexitasDatabase } from '#nexitas/server/utils/nexitas'
import { requestProject } from '#nexitas/server/utils/projects'
import { listStacks } from '../../../../../core/issues'

// A project's stacks, for its panel on the project's page.
export default defineEventHandler((event) =>
  listStacks(nexitasDatabase(), requestProject(event).id),
)
