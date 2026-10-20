import type { H3Event } from 'h3'
import { pacedAnnouncer } from '#nexitas/server/utils/changes'
import { nexitasDatabase } from '#nexitas/server/utils/nexitas'
import { getIssue, getStack } from '../core/issues'

export function routeStack(event: H3Event) {
  const stack = getStack(nexitasDatabase(), getRouterParam(event, 'id') ?? '')
  if (!stack) throw createError({ statusCode: 404, statusMessage: 'There is no such stack.' })
  return stack
}

export function routeIssue(event: H3Event) {
  const issue = getIssue(nexitasDatabase(), getRouterParam(event, 'id') ?? '')
  if (!issue) throw createError({ statusCode: 404, statusMessage: 'There is no such issue.' })
  return issue
}

/** A report was filed. A crash loop reports all the time, so open pages hear about it at most
 *  every 3 s, together with whatever else arrived meanwhile. */
export const announceReport = pacedAnnouncer(3000)
