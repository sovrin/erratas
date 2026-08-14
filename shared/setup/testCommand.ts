/**
 * The command that proves the pipe works.
 *
 * A stack with no events is ambiguous — nothing has broken, or nothing is
 * reporting — and this is what tells the two apart. If it lands, ingest is
 * reachable and the DSN is right, so the problem is in the reporting app; if it
 * does not, the problem is between that terminal and erratas.
 *
 * It encodes the frozen wire contract, which is why it lives here with a test
 * rather than inside a component: `content-type: text/plain` (anything else makes
 * the SDK's cross-origin POST non-simple), the key in the query string, and a body
 * that is one JSON event carrying `v`. Get any of those wrong and this hands
 * somebody a command that fails for a reason unrelated to what they are debugging.
 */

/** The smallest body `parseEvent` accepts: a version, and something to say. */
const MINIMAL_EVENT = '{"v":1,"message":"test event from curl"}'

export function testEventCommand(ingestUrl: string): string {
  // Single-quoted so the shell leaves the query string and the JSON alone. The URL
  // is on its own line because it is the long part and the one worth reading.
  return `curl -X POST \\
  '${ingestUrl}' \\
  -H 'content-type: text/plain' \\
  -d '${MINIMAL_EVENT}'`
}
