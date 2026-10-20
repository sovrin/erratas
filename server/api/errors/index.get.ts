import { nexitasDatabase } from '#nexitas/server/utils/nexitas'
import { listIssues } from '../../core/issues'

// Every issue, newest first; the list searches and pages them itself.
export default defineEventHandler(() => listIssues(nexitasDatabase()))
