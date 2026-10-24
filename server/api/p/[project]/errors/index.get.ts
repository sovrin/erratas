import { nexitasDatabase } from '#nexitas/server/utils/nexitas'
import { requestProject } from '#nexitas/server/utils/projects'
import { ISSUES_PER_PAGE, parseSearchQuery, setSearchToken } from '../../../../../shared/issues'
import { issuesPage } from '../../../../core/issues'

const text = (value: unknown) => (typeof value === 'string' ? value.slice(0, 200) : '')

// A page of the project's issues. The status (unresolved unless told, `all` for every one) wins
// over a `status:` typed into the search, as the status links do.
export default defineEventHandler((event) => {
  const { status, q, page, keep } = getQuery(event)
  const query = parseSearchQuery(setSearchToken(text(q), 'status', text(status) || 'unresolved'))
  return issuesPage(nexitasDatabase(), requestProject(event).id, {
    query,
    page: Math.min(10_000, Math.floor(Number(page)) || 1),
    pageSize: ISSUES_PER_PAGE,
    keep: text(keep),
  })
})
