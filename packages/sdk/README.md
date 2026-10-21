# @erratas/sdk

Report errors from a JavaScript or TypeScript application to an
[erratas](../../README.md) instance.

No runtime dependencies. Browser-first; usable from Node with explicit capture
calls.

## Use

```ts
import { init } from '@erratas/sdk'

init({ dsn: 'https://8f2ac1e9b7d4@erratas.sh/1' })
```

That is the whole setup. From then on, uncaught errors and unhandled promise
rejections are reported on their own.

In a browser, the instance also serves this entry as one module, so a page needs
no install or build step:

```html
<script type="module">
  import { init } from 'https://nexitas.example.com/v1/errors.js'
  init({ dsn: 'https://8f2ac1e9b7d4@nexitas.example.com/a1b2c3d4e5f6' })
</script>
```

Report something you caught yourself:

```ts
import { captureException, captureMessage } from '@erratas/sdk'

try {
  risky()
} catch (err) {
  captureException(err, { tags: { feature: 'checkout' } })
}

captureMessage('cache rebuilt', { level: 'info' })
```

### Options

|               |                                                             |
| ------------- | ----------------------------------------------------------- |
| `dsn`         | Required. `https://<publicKey>@<host>/<stackId>`            |
| `environment` | `production`, `staging`, …                                  |
| `release`     | Version or commit of your app, so an issue ties to a deploy |
| `tags`        | Attached to every event                                     |
| `autoCapture` | Install global handlers. Default `true` in a browser        |
| `beforeSend`  | Rewrite or drop an event; return `null` to drop             |
| `debug`       | Log SDK diagnostics to the console                          |

`beforeSend` is where personal data gets scrubbed before anything leaves the
machine:

```ts
init({
  dsn: '…',
  beforeSend: (event) => {
    if (event.request?.url?.includes('/admin')) return null
    return event
  },
})
```

### Short-lived processes

Reporting is buffered, so a CLI or a serverless handler can exit before the
queue drains. Flush first:

```ts
import { flush } from '@erratas/sdk'

await handler()
flush()
```

## What it will not do

- **Throw.** `init` with a broken DSN warns on the console and disables
  reporting. Every public function swallows its own failures. An error logger
  that can break the app it watches is worse than none.
- **Instrument Node's `uncaughtException`.** Attaching a listener there stops
  Node exiting on an uncaught throw, which would silently turn crashes into
  zombie processes. Call `captureException` from your own handler instead.
- **Report itself.** Transport failures are dropped, never re-reported — that
  is how an error logger becomes an infinite loop.
- **Send everything.** Identical errors inside a 5 second window collapse to
  one, and there is a hard ceiling of 30 events per minute. A throw inside a
  render loop is one bug, not forty thousand.

## The wire

One `POST` per event to `{dsn.host}/v1/errors/{stackId}?erratas_key=…`.

The body is JSON, sent as `content-type: text/plain` — deliberately. That is a
CORS-safelisted value, so a cross-origin report does not trigger an `OPTIONS`
preflight, and it matches what `navigator.sendBeacon` can send while a page is
closing. The key is in the query string for the same reason: `sendBeacon` cannot
set headers.

Payloads carry `v: 1`. The shape is a permanent contract — released SDK versions
live in applications nobody controls, so ingest keeps accepting old versions
rather than the SDK being expected to update.

## Develop

```bash
pnpm test                 # from the repo root
pnpm typecheck
pnpm sdk:build
```
