/**
 * Assembling the DSN a user copies out of the setup panel.
 *
 * This is the other half of `@erratas/sdk`'s `parseDsn`, and the two have to
 * agree exactly — a DSN that this builds and the SDK cannot read is a support
 * ticket that looks like "the SDK is broken". `dsn.test.ts` round-trips one
 * through the SDK's own parser rather than asserting a string, so the two stay
 * married even if the format grows.
 */

export interface DsnParts {
  /** Where reports are sent — the ingest host, not necessarily this dashboard. */
  host: string
  /** The stack's public key. */
  publicKey: string
  /**
   * The stack's id, which becomes the path segment.
   *
   * The design mocked this as a short `/1`. A sequential id needs a server-side
   * counter to allocate without racing plus a second unique column to enforce,
   * and buys nothing but looks — the record id is unique for free, and the DSN
   * is copied, never typed.
   */
  stackId: string
  protocol?: 'http' | 'https'
}

export function buildDsn({ host, publicKey, stackId, protocol }: DsnParts): string {
  // http only when explicitly asked for. Defaulting to it because a dev
  // instance runs on localhost would mean the DSN handed to a *production*
  // app inherits whatever scheme the dashboard happened to be opened with.
  const scheme = protocol ?? 'https'
  return `${scheme}://${publicKey}@${stripTrailingSlash(host)}/${stackId}`
}

function stripTrailingSlash(host: string): string {
  return host.replace(/\/+$/, '')
}

// Public keys are minted by PocketBase, in `ownership.pb.js` — the client never
// chooses one, so there is deliberately no generator here.
