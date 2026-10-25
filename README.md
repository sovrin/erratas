# erratas

A very simple, lightweight Sentry alternative. Your apps report their exceptions; erratas groups
them into issues and shows what is breaking, with the stack trace.

**erratas is a module for [nexitas](https://github.com/sovrin/nexitas), not an app of its own.** It
ships inside nexitas, which builds it in from its `modules.json`, and an install's owner switches it
on as Errors. nexitas brings the sign-in, the page shell, the database and the projects (each site's
name and origins); erratas adds:

- **stacks per project**: one per runtime (the site, its API, a worker), each with its own DSN, so a
  key leaked from a browser bundle is not the key the backend reports with;
- **issues**: events collapse into one issue per bug, counted, with the newest environment, release
  and stack trace;
- the Errors pages: every issue with one search box, and an issue's own page to resolve, ignore,
  reopen or delete it;
- the Errors page's setup: the project's stacks, the snippet and DSN for each, a test command;
- ingest, the public route apps report to, and [`@erratas/sdk`](packages/sdk/README.md), the client
  that reports.

## How it fits together

```
app (browser) ── import /v1/errors.js, init({ dsn })                → the SDK, served here
app ─────────── POST /v1/errors/<stack>?erratas_key=<key>          → one event, grouped into an issue
owner ───────── /p/<project>/errors?q=status:unresolved             its issues, searched (signed in)
              ── /p/<project>/errors/<issue>                         one issue and its stack trace
              ── /p/<project>                                        its stacks, DSNs and snippets
```

The DSN is Sentry's shape, `https://<key>@<host>/<stack>`. It is public by design: it ships inside
browser bundles, says which stack a report belongs to and grants nothing else. A browser may report
only from one of the project's origins; a server sends no origin and needs only the DSN. Each sender
may post 60 events a minute (the SDK sends at most 30). Removing a stack is the only way to retire a
key.

**Grouping** is the load-bearing rule: an issue's fingerprint is the exception type plus the top
three frames by function and file, never line, column, query string or a bundler's hex hash, which
change without the bug changing. Message-only events group on their message, digits collapsed. A
resolved issue that recurs reopens; an ignored one stays ignored.

### Search

Free text matches an issue's title and culprit; `key:value` narrows: `status`, `level`, `stack`,
`env`, `release`. Values match as substrings (`release:v2.4` finds `v2.4.1`), `status` and
`level` by prefix. Every token must match. The search lives in the address, so a project's status
links and an issue's properties open the list narrowed.

## The SDK

`packages/sdk` is `@erratas/sdk`: TypeScript, browser-first, no runtime dependencies. Its README has
the API. Every build of nexitas with erratas bundles its browser entry into `/v1/errors.js`, so a
page can import it from the instance; servers install the package for `@erratas/sdk/node`, which
attaches the source lines around each throw.

The wire format is a contract with every SDK already shipped: one JSON event per `POST`, labelled
`text/plain` and with the key in the query string, so a cross-origin report needs no preflight and
`sendBeacon` can send it. Payloads carry `v: 1`; ingest only ever learns new versions.

## Admin API

The pages use it, under the owner's session; writes come from nexitas' own origin, like every `/api`
route. All paths are a project's and start with `/api/p/<project>/errors`; another project's issue
or stack is not found.

| Request                                    | Does                                                |
| ------------------------------------------ | --------------------------------------------------- |
| `GET /`                                    | The project's issues, newest first, without traces  |
| `GET · POST /issues/:id` · `POST …/delete` | Read with its trace · set `{ status }` · delete     |
| `GET · POST /stacks`                       | The project's stacks · add one `{ name, platform }` |
| `POST /stacks/:id/delete`                  | Delete a stack and its issues                       |

Deleting a project in nexitas deletes its stacks and issues with it.

## Develop

erratas has no app, build or image of its own: it runs inside nexitas. Check out nexitas, aequitas
and erratas next to each other, build aequitas once (`cd ../aequitas && pnpm install && pnpm build`),
and put this checkout into nexitas' modules:

```sh
pnpm install
ln -s ../../erratas ../nexitas/.modules/erratas
cd ../nexitas && node scripts/modules.ts && pnpm install && pnpm dev
```

Open http://localhost:3000, create the owner with the key in nexitas' `.data/bootstrap-token`, and
switch Errors on, at setup or under Modules. Add a project with a stack, then send its test command,
or run `pnpm debug` here: a page on its own origin (`:3001`, add it to the project's sites) that
throws every kind of error through the SDK and shows what left the browser.

Two SDK builds: `pnpm build:sdk` bundles the browser script nexitas serves (`public/v1/errors.js`),
`pnpm sdk:build` builds the `@erratas/sdk` package itself (`packages/sdk/dist`).

## In an install

erratas runs wherever nexitas does: see nexitas' README for Compose, the proxy and the settings.
No event, address or user agent is kept, only the issue it counts towards. Off (under Modules), its
pages and ingest answer 404; its issues are kept.

## Not here yet

Retention (issues stay until deleted), renaming a stack or rotating its key in place, users affected
per issue, search and paging in SQL past a few thousand issues.

## Checks

```sh
pnpm check         # the SDK's typecheck and the unit tests
pnpm lint
pnpm format:check
node ../aequitas/dist/aequitas-check.mjs --css ../nexitas/app/assets/nexitas.css app/**/*.vue
```

The pages and server are typechecked in nexitas (`pnpm check` there).
