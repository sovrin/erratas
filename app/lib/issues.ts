import type { IssueLevel } from '../../shared/contracts'

/** The marker's tone for an open issue of each level. */
export const levelTones: Record<IssueLevel, 'danger' | 'warning' | 'info'> = {
  error: 'danger',
  warning: 'warning',
  info: 'info',
}

/** The key the project's issue list is fetched under, so an issue's page can refresh it. */
export const issuesKey = (project: string) => `erratas-issues-${project}`
