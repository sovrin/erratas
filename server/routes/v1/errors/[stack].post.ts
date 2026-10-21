import { createLimiter } from '#nexitas/server/core/limits'
import { tokensMatch } from '#nexitas/server/core/auth'
import { nexitasDatabase, requestSender } from '#nexitas/server/utils/nexitas'
import { IngestError, parseEvent } from '../../../core/ingest'
import { getStack, recordEvent } from '../../../core/issues'
import { announceReport } from '../../../utils/erratas'

// The SDK caps itself at 30 a minute; a sender past twice that is not an app in a crash loop but
// someone filling the disk with a public key.
const perSender = createLimiter(60, 60 * 1000)

// One event from the SDK, labelled text/plain so a browser sends it without a preflight: the body
// is parsed here, whatever its type says. The key is the credential and the path only routes, so
// an unknown key, an unknown stack and a key for another stack all look the same.
export default defineEventHandler(async (event) => {
  const db = nexitasDatabase()
  const stack = getStack(db, getRouterParam(event, 'stack') ?? '')
  const key = getQuery(event).erratas_key
  if (!stack || typeof key !== 'string' || !tokensMatch(key, stack.publicKey))
    throw createError({ statusCode: 401, statusMessage: 'Unknown key.' })
  if (!perSender.hit(requestSender(event)))
    throw createError({ statusCode: 429, statusMessage: 'Too many events. Try again later.' })
  try {
    const id = recordEvent(db, stack.id, parseEvent((await readRawBody(event, 'utf8')) ?? ''))
    announceReport()
    return { id }
  } catch (cause) {
    if (cause instanceof IngestError)
      throw createError({ statusCode: cause.status, statusMessage: cause.message })
    throw cause
  }
})
