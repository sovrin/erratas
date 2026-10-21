# Agent notes for erratas

Conventions for working on erratas, in code and in the interface. "Lightweight" is the premise:
when a feature is proposed, the first question is whether it can be left out.

## Code

- erratas is a module of [nexitas](https://github.com/sovrin/nexitas): a plain Nuxt layer that
  nexitas extends. The owner's sign-in, the `/api` guard, live updates, the database, projects and
  the page shell are there, and plug-in points are its interfaces (`shared/modules.ts`). erratas
  registers itself in `server/core/module.ts`. What every module needs belongs in nexitas; what only
  erratas needs, here.
- A project's stacks belong to one nexitas project, its issues to a stack. Its panel on a project's
  page is `app/components/global/ErratasProject.vue`.
- Import by relative path (or `#nexitas/...`): `~` and `#shared` resolve against nexitas, the app
  around this layer. Nothing app-wide lives here: no name, logo, favicon or sign-in lines.
- Keep comprehension debt low: explicit control flow, small modules, framework conventions, no
  speculative abstractions. Comments say why, not what.
- Rules worth testing are plain functions: `shared/issues.ts` (search, summary, paging),
  `shared/setup.ts` (DSN, snippets, test command), `server/core/ingest.ts` (parsing and grouping).
  Input checks for the admin API are zod, in `shared/contracts.ts`.
- Data access is plain SQL in `server/core/*.ts`: functions that take the database first, no ORM.
  Schema changes are a new step in `migrations` in `server/core/module.ts`; never edit a released
  step.
- **Grouping is the load-bearing idea** (`fingerprintOf`): changing it splits or merges every
  issue's history, so a new rule gets a new prefix (`v2:`) rather than changing `v1:`.
- **Ingest treats every byte as hostile**: strings clamped, arrays capped, nothing trusted to be its
  type, and a bad event is always a 4xx, never a 500. A stack trace is a stranger's text: never
  render it as HTML.
- **The wire is frozen** (`packages/sdk/src/dsn.ts`, `transport.ts`): released SDKs live in other
  people's apps, so ingest keeps accepting every shape it ever accepted. `v` on every payload; bump
  it for an incompatible shape, and branch on it in ingest.
- `/api/p/<project>/errors/*` is the owner's (nexitas' security middleware), which finds the
  project; handlers take it with `requestProject(event)`, pages with `useProject()`, and every
  query is scoped by it. Ingest, `/v1/errors/<stack>`, is public through `publicRoutes`: the key is
  the credential, browsers only from the project's origins, a per-sender limit. The DSN is public;
  never let it read anything.
- The pages are live: whatever changes what they show calls `announceChange()` (ingest, which can
  come all the time, `announceReport()`), and every view that shows data passes its refresh to
  `useLive`.

## The SDK

`packages/sdk` (`@erratas/sdk`) must never break the host app: never throw out of a public API,
never reject an unhandled promise, never report its own failures. No runtime dependencies; size is
a feature. Frames are innermost-first, since grouping reads the top ones. `SDK_VERSION` is inlined
in `src/version.ts`, and a test pins it to `package.json`. `node:fs` stays in `src/node/`. Its
browser entry is bundled to `public/v1/errors.js` (`pnpm build:sdk`) by every nexitas build.

## UI

nexitas' UI rules apply as they are (`../nexitas/AGENTS.md`, "UI"). erratas' own: ids, DSNs, frames
and source are mono; a stack trace or a title is a stranger's text, shown as text, never as markup.

## Checks

`pnpm check`, `pnpm lint` and `pnpm format:check` must stay green here, and `pnpm check` and
`pnpm build` in nexitas with this checkout in its `.modules/`.

## Commits and releases

Commit messages are [conventional](https://www.conventionalcommits.org):
`feat(ingest): …`, `fix: …`, `docs(readme): …`. Give a scope or leave the parentheses out; never
write `feat(): …`. release-please can't parse an empty scope and silently drops the commit from
the next version and the changelog. Before 1.0, `feat` and `fix` bump the patch version and a
change marked `!` the minor. Mark a change that breaks the ingest wire or the SDK's API with `!`
(`feat(sdk)!: …`), since apps out there depend on them. Don't edit the version in `package.json` or
`CHANGELOG.md` by hand; the release PR does that.
