/**
 * The DSN — `https://8f2ac1e9b7d4@erratas.sh/1` — is the only thing a user
 * configures, and it is public by design: it ships inside browser bundles,
 * where anyone can read it. It says *which stack an event belongs to*, not
 * *who is sending it*. It must therefore never grant read access to anything;
 * abuse is answered with rate limits and key rotation, not with secrecy.
 *
 * The format is Sentry's, where the trailing path segment is a project id. In
 * erratas it identifies a **stack** — one runtime within a project, so that a
 * browser key and a backend key are different keys. The wire shape is
 * unchanged; only the name of the thing it points at differs, and it is named
 * for what it actually is here rather than for where the format came from.
 */

export interface Dsn {
  protocol: 'http' | 'https'
  publicKey: string
  host: string
  /** '' when the URL used the protocol's default port. */
  port: string
  /**
   * Any path the instance is mounted under, without a trailing slash, '' at the
   * root. Self-hosting behind a reverse proxy at /erratas is normal, and the
   * stack id is the *last* segment rather than the only one because of it.
   */
  pathPrefix: string
  stackId: string
}

export class DsnError extends Error {
  override name = 'DsnError'
}

export function parseDsn(raw: string): Dsn {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new DsnError('DSN is empty')
  }

  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new DsnError(`DSN is not a URL: ${raw}`)
  }

  const protocol = url.protocol.replace(':', '')
  if (protocol !== 'http' && protocol !== 'https') {
    throw new DsnError(`DSN protocol must be http or https, got ${protocol}`)
  }

  // The key is the URL's userinfo. Sentry's original format had a second,
  // secret half here (`publicKey:secretKey@`); it was removed years ago
  // because a browser SDK can never keep it. Accept and ignore a password
  // rather than rejecting, so a DSN pasted from an old tutorial still works.
  const publicKey = decodeURIComponent(url.username)
  if (!publicKey) throw new DsnError('DSN has no public key')

  const segments = url.pathname.split('/').filter(Boolean)
  const stackId = segments.pop() ?? ''
  if (!stackId) throw new DsnError('DSN has no stack id')

  return {
    protocol,
    publicKey,
    host: url.hostname,
    port: url.port,
    pathPrefix: segments.length ? `/${segments.join('/')}` : '',
    stackId,
  }
}

/**
 * Where events are POSTed: a public route of the erratas module in nexitas.
 *
 * The shape is fixed the moment an SDK ships: released versions sit in
 * applications that will never be updated, so this URL can be added to but not
 * changed. The stack id is in the path (cheap to route on, and it is public
 * anyway) and the key is in the *query string* — deliberately, see below.
 */
export function ingestUrl(dsn: Dsn): string {
  const host = dsn.port ? `${dsn.host}:${dsn.port}` : dsn.host
  const base = `${dsn.protocol}://${host}${dsn.pathPrefix}/v1/errors/${dsn.stackId}`

  // The key rides in the query string rather than in an Authorization or
  // X-Erratas-Key header for two reasons, both of which are about the browser
  // and neither of which is about aesthetics:
  //
  //   1. A custom request header makes a cross-origin POST "non-simple", so the
  //      browser fires an OPTIONS preflight first — doubling every report, and
  //      failing outright once the page has started unloading.
  //   2. navigator.sendBeacon, the only transport that reliably survives page
  //      unload, cannot set headers at all.
  //
  // Since the key is public this costs nothing in confidentiality. It does mean
  // the key lands in the ingest server's access logs, which is fine for a value
  // that is already visible in every bundle that carries it.
  return `${base}?erratas_key=${encodeURIComponent(dsn.publicKey)}`
}
