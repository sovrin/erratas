import { routeIssue } from '#self/server/utils/erratas'

export default defineEventHandler((event) => routeIssue(event))
