import type { IssueLevel } from '../../shared/contracts'

/** The marker's tone for an open issue of each level. */
export const levelTones: Record<IssueLevel, 'danger' | 'warning' | 'info'> = {
  error: 'danger',
  warning: 'warning',
  info: 'info',
}
