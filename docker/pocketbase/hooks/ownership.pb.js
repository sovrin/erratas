/// <reference path="../pb_data/types.d.ts" />

// Who owns what, enforced server-side.
//
// API rules do the reading side of this well — `@request.auth.id = owner.id` on
// projects, `@request.auth.id = project.owner.id` on stacks and issues, so no
// account can list or read another's. What rules cannot do is the *writing*
// side: a create rule can only assert that somebody is signed in. It cannot pin
// a relation to the caller, and it cannot reach through a relation to check the
// owner of the thing being pointed at.
//
// So before this file existed, any signed-in account could POST a project with
// somebody else's `owner`, or — worse — a stack into somebody else's project,
// which hands them a working DSN for that project's data.
//
// Implementation lives in ownership.js (handlers run in isolated VMs).
//
// Superusers are exempt throughout: they are administering the instance from
// the admin UI, where being unable to create a record on someone's behalf would
// make the tool useless.

// -- projects ---------------------------------------------------------------

// `owner` is stamped rather than validated. The client sends nothing useful
// here, and overwriting is one less branch than rejecting.
onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) e.record.set('owner', e.auth.id)
  e.next()
}, 'projects')

// A project must not change hands. Without this, the update rule lets an owner
// hand their project — and every issue in it — to another account.
onRecordUpdateRequest((e) => {
  if (!e.hasSuperuserAuth()) e.record.set('owner', e.record.original().getString('owner'))
  e.next()
}, 'projects')

// -- stacks -----------------------------------------------------------------

onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    const { requireOwnedProject, generatePublicKey } = require(`${__hooks}/ownership.js`)
    requireOwnedProject(e.app, e.auth, e.record.getString('project'))
    // Always server-minted, whatever the client sent.
    e.record.set('publicKey', generatePublicKey())
  }
  e.next()
}, 'stacks')

// `name` and `platform` stay editable — they are relabelling, and the setup
// panel writes them on every keystroke. `project` and `publicKey` do not:
// moving a stack between projects would relocate its issues, and rewriting the
// key would silently break every application already reporting with it.
//
// Rotation, when it arrives, is a new stack (or a new key row) rather than an
// edit to this one, precisely so the old key keeps working until it is retired.
onRecordUpdateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    const original = e.record.original()
    e.record.set('project', original.getString('project'))
    e.record.set('publicKey', original.getString('publicKey'))
  }
  e.next()
}, 'stacks')

// -- issues -----------------------------------------------------------------

// Issues will be written by ingest rather than by a browser, but the create
// rule admits any signed-in caller today and the dashboard's own seeding path
// goes through here, so the same check applies.
//
// `project` is *derived* from the stack rather than trusted from the request:
// the two must agree, and deriving makes disagreement impossible instead of
// something to detect.
onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    const { requireOwnedProject } = require(`${__hooks}/ownership.js`)

    const stackId = e.record.getString('stack')
    if (!stackId) throw new BadRequestError('stack is required')

    let stack
    try {
      stack = e.app.findRecordById('stacks', stackId)
    } catch {
      throw new NotFoundError('No such stack.')
    }

    requireOwnedProject(e.app, e.auth, stack.getString('project'))
    e.record.set('project', stack.getString('project'))
  }
  e.next()
}, 'issues')

// An issue's identity is fixed: which stack it belongs to, and the fingerprint
// that decided it was this bug rather than a new one. A client may resolve,
// ignore or reopen it — that is what the dashboard's buttons do — but must not
// re-point it or re-group it.
onRecordUpdateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    const original = e.record.original()
    e.record.set('project', original.getString('project'))
    e.record.set('stack', original.getString('stack'))
    e.record.set('fingerprint', original.getString('fingerprint'))
  }
  e.next()
}, 'issues')
