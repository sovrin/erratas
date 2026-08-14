/// <reference path="../pb_data/types.d.ts" />

// Event ingest — the other plane.
//
//   POST /api/ingest/{stackId}?erratas_key={publicKey}
//
// Reached from the Nitro route at server/api/[stackId]/store.ts, which is the
// only publicly-listening surface (PocketBase binds 127.0.0.1). Nitro handles
// CORS and rejects the obviously-too-large early; it does *not* validate, and
// this handler assumes nothing about having been called through it. The `/pb`
// proxy means a browser could reach this endpoint directly, so every check that
// matters has to be here.
//
// Nothing about this path uses a session. The DSN key is the whole credential:
// it says which stack to file under, it is public by design, and it grants
// write and nothing else.
//
// Implementation lives in ingest.js (handlers run in isolated VMs).

routerAdd('POST', '/api/ingest/{stackId}', (e) => {
  const ingest = require(`${__hooks}/ingest.js`)

  const stackId = e.request.pathValue('stackId')
  const key = e.request.url.query().get('erratas_key') || ''

  if (!stackId || !key) return e.json(400, { error: 'missing stack or key' })

  // Look up by key and then check the stack matches, rather than the other way
  // round: the key is the credential and the id in the path is only routing, so
  // a valid key for the wrong stack must fail exactly like an invalid one.
  let stack
  try {
    stack = e.app.findFirstRecordByFilter('stacks', 'publicKey = {:key}', { key: key })
  } catch {
    stack = null
  }

  // One answer for "no such key", "no such stack" and "key belongs elsewhere".
  // Distinguishing them would let anyone enumerate which stacks exist.
  if (!stack || stack.id !== stackId) {
    return e.json(401, { error: 'unknown key' })
  }

  let event
  try {
    // toString caps the read, so an enormous body cannot be pulled into memory
    // here — it arrives truncated and fails to parse, which parseEvent reports
    // as a 400. The explicit length check inside it catches the rest.
    event = ingest.parseEvent(toString(e.request.body, ingest.MAX_EVENT_BYTES + 1024))
  } catch (err) {
    // A malformed event is the caller's problem and must never be a 500 — an
    // SDK that gets a 500 has no way to know it should stop retrying.
    return e.json(err.ingestStatus || 400, { error: String(err.message || err) })
  }

  try {
    // Note `ingest.upsertIssue`, not a local helper: a handler runs in its own
    // isolated VM and cannot see anything declared at the top level of this
    // file, so *all* of the implementation has to come through the require.
    const record = ingest.upsertIssue(e.app, stack, event)
    return e.json(200, { id: record.id })
  } catch (err) {
    // Reaching here means our own logic or the database failed, not the
    // caller's payload. Worth a log line; still not worth leaking internals.
    console.warn('ingest failed for stack ' + stack.id + ': ' + err)
    return e.json(500, { error: 'could not record that event' })
  }
})
