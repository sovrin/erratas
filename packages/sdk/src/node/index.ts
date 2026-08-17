/**
 * The Node entry point — `@erratas/sdk/node`.
 *
 * Kept apart from the main entry, and the separation is enforced rather than
 * merely intended: this module imports `node:fs`, the build runs with
 * `failOnWarn`, so the moment anything here is pulled into the browser bundle
 * the build fails loudly instead of shipping a broken artifact to somebody's
 * users.
 *
 * Nothing here auto-installs. Node is deliberately not auto-instrumented — see
 * `captureException` — and this follows the same rule: it hands back a function
 * you pass to `init`, so attaching your source to your error reports stays an
 * explicit decision.
 */
export { withSourceContext, type SourceContextOptions } from './sourceContext'
export {
  createSymbolicateHandler,
  createSymbolicateResolver,
  type SymbolicateHandlerOptions,
} from './symbolicate'
export { DEFAULT_CONTEXT_LINES, MAX_LINE_CHARS, sliceSourceLines } from '../sourceLines'
export type { SourceLine } from '../types'
