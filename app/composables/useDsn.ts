import { buildDsn, buildIngestUrl } from '#shared/domain/dsn'
import type { Stack } from '#shared/domain/types'

/**
 * The DSN shown for a stack, resolved against wherever this instance ingests.
 *
 * `NUXT_PUBLIC_INGEST_HOST` wins when set, because the host a customer's
 * application must reach is not always the host this dashboard is served from —
 * an instance behind a proxy, or one with a dedicated ingest name, would
 * otherwise hand out a DSN that resolves only from inside the browser tab that
 * generated it.
 *
 * Falling back to the current origin is right for the common case (one box,
 * one hostname) and is honest during development: a localhost dashboard hands
 * out a localhost DSN, which is exactly what a local app should report to.
 */
export function useDsn() {
  const config = useRuntimeConfig()

  const origin = computed(() => {
    const configured = config.public.ingestHost
    if (configured) return { host: configured, protocol: undefined }

    // Client-only app (`ssr: false`), so `location` is always there — but read
    // defensively anyway, because a build-time prerender pass would not have it.
    if (typeof location === 'undefined')
      return { host: 'localhost:3000', protocol: 'http' as const }

    return {
      host: location.host,
      protocol: location.protocol === 'http:' ? ('http' as const) : ('https' as const),
    }
  })

  function partsFor(stack: Stack) {
    return {
      host: origin.value.host,
      protocol: origin.value.protocol,
      publicKey: stack.publicKey,
      stackId: stack.id,
    }
  }

  function dsnFor(stack: Stack): string {
    return buildDsn(partsFor(stack))
  }

  /** Where this stack's SDK posts — shown when a stack has yet to report. */
  function ingestUrlFor(stack: Stack): string {
    return buildIngestUrl(partsFor(stack))
  }

  return { dsnFor, ingestUrlFor }
}
