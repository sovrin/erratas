/// <reference path="../pb_data/types.d.ts" />

// A stack is one runtime inside a project — the Nuxt frontend, the PHP API, a
// worker. Each gets its own DSN, which is the whole reason the level exists:
// without it a project has one key, and a leaked browser key would also be the
// key the backend reports with.
//
// The DSN is assembled in the app as `https://{publicKey}@{host}/{id}` where
// `{id}` is this record's own PocketBase id. That resolves the question the
// design left open — a short sequential id like `/1` would read better, but it
// needs a server-side counter to allocate without racing, and a second unique
// column to enforce. The record id is unique for free.
//
// `publicKey` is *public*: it ships inside browser bundles by design. It routes
// writes to this stack and grants nothing else, so it is not a secret and does
// not need to be unguessable — only unique, which the index below enforces.
// It is generated client-side for now; that moves into a create hook when
// ingest lands, at which point the client stops being trusted to pick it.
migrate(
  (app) => {
    const projects = app.findCollectionByNameOrId('projects')

    const collection = new Collection({
      name: 'stacks',
      type: 'base',
      // Ownership is inherited: a stack has no owner of its own, it belongs to
      // whoever owns the project. Following the relation keeps the two from
      // drifting apart the way a duplicated `owner` column would.
      listRule: '@request.auth.id = project.owner.id',
      viewRule: '@request.auth.id = project.owner.id',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id = project.owner.id',
      deleteRule: '@request.auth.id = project.owner.id',
      fields: [
        {
          name: 'project',
          type: 'relation',
          required: true,
          collectionId: projects.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'name', type: 'text', required: true, max: 60 },
        // Free text, not a select: it only decides which install snippet is
        // shown, and a closed list would mean a migration every time somebody
        // reports from a runtime we did not think of.
        { name: 'platform', type: 'text', required: false, max: 40 },
        { name: 'publicKey', type: 'text', required: true, min: 8, max: 64 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX `idx_stacks_project` ON `stacks` (`project`)',
        // Global, not per-project: ingest is handed a key and has to find the
        // stack from it alone.
        'CREATE UNIQUE INDEX `idx_stacks_public_key` ON `stacks` (`publicKey`)',
      ],
    })

    return app.save(collection)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('stacks')
    return app.delete(collection)
  },
)
