/// <reference path="../pb_data/types.d.ts" />

// A project is one product being watched. It owns stacks (see the next
// migration) and, through them, issues.
//
// Unlike the shared catalogues some apps have, nothing here is public: an
// account's projects are its own, so every rule is pinned to `owner` rather
// than to "somebody is signed in". The `owner` relation cannot be trusted from
// the client — a create rule can only assert that a caller is authenticated —
// so it is re-stamped server-side; until that hook exists the client sets it
// and the update rule stops it being moved to another account.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')

    const collection = new Collection({
      name: 'projects',
      type: 'base',
      listRule: '@request.auth.id = owner.id',
      viewRule: '@request.auth.id = owner.id',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id = owner.id',
      deleteRule: '@request.auth.id = owner.id',
      fields: [
        {
          name: 'owner',
          type: 'relation',
          required: true,
          collectionId: users.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'name', type: 'text', required: true, max: 120 },
        // Retention is a promise about disk, not a preference: events are
        // append-only and unbounded, so something has to delete them. Stored as
        // a select rather than a number of days because "forever" is a real
        // answer for a small self-hosted instance and does not fit in an int.
        {
          name: 'retention',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['30d', '90d', 'forever'],
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX `idx_projects_owner` ON `projects` (`owner`)'],
    })

    return app.save(collection)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('projects')
    return app.delete(collection)
  },
)
