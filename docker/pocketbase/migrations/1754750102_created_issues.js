/// <reference path="../pb_data/types.d.ts" />

// An issue is a *distinct bug*, not a report of one. Many thousands of events
// collapse into a single row here by fingerprint, which is the idea worth
// copying from Sentry: without it a dashboard is a log tail and stops being
// readable at the first crash loop.
//
// Consequences of that choice, visible in the columns below:
//
//   - `count` and `users` are running totals, incremented as events arrive,
//     rather than something derived by counting rows at read time.
//   - `firstSeen` / `lastSeen` are real dates. The design showed "12m" and
//     "9d ago", but storing the rendered string would make every list a lie the
//     moment the page sat open, and would make sorting alphabetical.
//   - `environment`, `release`, `user`, `os`, `browser`, `runtime` are the
//     *most recent* values seen, not a history. Keeping every distinct value
//     per issue is a second table and a much larger product; the last one
//     answers "where is this happening now", which is the question being asked.
//   - `frames` is the representative stack, stored as JSON exactly as the SDK
//     sent it. It is never parsed into columns: a stack is display material and
//     the shape differs per platform.
//
// `fingerprint` is what ingest will look up to decide "same bug or new one".
// It is unique per stack rather than per project, so the same exception in the
// frontend and in the backend stays two issues — they have different causes and
// different fixes.
migrate(
  (app) => {
    const projects = app.findCollectionByNameOrId('projects')
    const stacks = app.findCollectionByNameOrId('stacks')

    const collection = new Collection({
      name: 'issues',
      type: 'base',
      listRule: '@request.auth.id = project.owner.id',
      viewRule: '@request.auth.id = project.owner.id',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id = project.owner.id',
      deleteRule: '@request.auth.id = project.owner.id',
      fields: [
        // Denormalised from `stack.project` on purpose: every list query in the
        // dashboard filters by project, and making that a two-hop relation
        // filter would put a join on the hot path for no gain.
        {
          name: 'project',
          type: 'relation',
          required: true,
          collectionId: projects.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'stack',
          type: 'relation',
          required: true,
          collectionId: stacks.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'fingerprint', type: 'text', required: true, max: 128 },
        { name: 'title', type: 'text', required: true, max: 500 },
        // "Where it happened", in one line — `renderUserList (UserList.vue:42)`.
        // Derived from the top frame at ingest, stored so lists don't have to
        // read the whole `frames` blob to render a row.
        { name: 'culprit', type: 'text', required: false, max: 500 },
        {
          name: 'level',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['error', 'warning', 'info'],
        },
        // `unresolved` is the resting state — an issue exists because something
        // broke, and it stays in the way until somebody says otherwise.
        {
          name: 'status',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['unresolved', 'resolved', 'ignored'],
        },
        { name: 'count', type: 'number', required: false, onlyInt: true, min: 0 },
        { name: 'users', type: 'number', required: false, onlyInt: true, min: 0 },
        { name: 'firstSeen', type: 'date', required: false },
        { name: 'lastSeen', type: 'date', required: false },
        { name: 'environment', type: 'text', required: false, max: 60 },
        { name: 'release', type: 'text', required: false, max: 60 },
        { name: 'user', type: 'text', required: false, max: 200 },
        { name: 'os', type: 'text', required: false, max: 60 },
        { name: 'browser', type: 'text', required: false, max: 60 },
        { name: 'runtime', type: 'text', required: false, max: 120 },
        // An explicit max because PocketBase falls back to 5000 characters for
        // an unbounded JSON field, and a deep stack with source context around
        // every frame runs past that.
        { name: 'frames', type: 'json', required: false, maxSize: 500000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        // The dashboard's default query: this project, newest first.
        'CREATE INDEX `idx_issues_project_last_seen` ON `issues` (`project`, `lastSeen`)',
        'CREATE INDEX `idx_issues_project_status` ON `issues` (`project`, `status`)',
        // Ingest's lookup, and the constraint that makes grouping mean anything.
        'CREATE UNIQUE INDEX `idx_issues_stack_fingerprint` ON `issues` (`stack`, `fingerprint`)',
      ],
    })

    return app.save(collection)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('issues')
    return app.delete(collection)
  },
)
