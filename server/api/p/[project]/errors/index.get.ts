import { nexitasDatabase } from '#nexitas/server/utils/nexitas'
import { requestProject } from '#nexitas/server/utils/projects'
import { listIssues } from '../../../../core/issues'

// A project's issues, newest first; the list searches and pages them itself.
export default defineEventHandler((event) =>
  listIssues(nexitasDatabase(), requestProject(event).id),
)
