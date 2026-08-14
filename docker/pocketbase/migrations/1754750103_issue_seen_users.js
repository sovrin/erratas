/// <reference path="../pb_data/types.d.ts" />

// "How many people did this affect" needs somewhere to remember *who*, because
// counting distinct anything from a running total is impossible — increment on
// every event and the number is the event count again.
//
// The cheap correct-enough answer is a bounded set of hashes per issue:
//
//   - Hashed, not the raw identifier. The set would otherwise be a mineable
//     list of every affected user's email, which is a much more sensitive
//     object than the single most-recent value in `issues.user`. Eight hex
//     characters is 32 bits — collisions are possible in principle and would
//     undercount by one, which is a price worth paying for a column that stays
//     small.
//   - Bounded, because it is written on every single event. At the cap the set
//     stops growing and `users` stops rising, so the number reads "at least
//     this many" for the largest issues. The alternative — an unbounded set, or
//     a real events table — is a different and much heavier product.
//
// A proper distinct count (HyperLogLog, or an events table with a retention
// window) is the upgrade path if this ever proves too coarse.
const CAP_NOTE = 'up to 500 hashed user ids; see docker/pocketbase/hooks/ingest.js'

migrate(
  (app) => {
    const issues = app.findCollectionByNameOrId('issues')
    issues.fields.add(
      new JSONField({
        name: 'seenUsers',
        required: false,
        // 500 entries × 8 chars + JSON overhead, with room to spare.
        maxSize: 8000,
        presentable: false,
      }),
    )
    console.log('issues.seenUsers: ' + CAP_NOTE)
    return app.save(issues)
  },
  (app) => {
    const issues = app.findCollectionByNameOrId('issues')
    issues.fields.removeByName('seenUsers')
    return app.save(issues)
  },
)
