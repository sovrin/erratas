// Shared by ownership.pb.js — PocketBase runs each hook handler in an isolated
// VM, so common code has to be require()'d rather than defined top-level.
//
// This file is hand-written project code living in a directory that .gitignore
// otherwise reserves for the vendored schema generator; there is an explicit
// `!` rule for it. Losing it on a fresh clone would silently remove every check
// below while leaving the app apparently working, which is the worst kind of
// missing file.

/**
 * Resolves a project id to a record the caller is actually allowed to write to.
 *
 * This exists because a PocketBase create rule cannot express it. The rule on
 * `stacks` and `issues` can only say "somebody is signed in" — it has no way to
 * reach through the `project` relation and compare its owner to the caller. So
 * without this check any signed-in account could create a stack, and therefore
 * a working DSN, inside somebody else's project.
 *
 * `NotFoundError` for both "no such project" and "not yours" on purpose: the
 * two answers are the same to anyone who isn't the owner, and distinguishing
 * them would turn this into an oracle for which project ids exist.
 */
function requireOwnedProject(app, auth, projectId) {
  if (!projectId) throw new BadRequestError('project is required')

  let project
  try {
    project = app.findRecordById('projects', projectId)
  } catch {
    throw new NotFoundError('No such project.')
  }

  if (project.getString('owner') !== auth.id) throw new NotFoundError('No such project.')

  return project
}

/**
 * Mints a stack's public key.
 *
 * The value is public — it ships inside browser bundles — so this is not about
 * secrecy. It is about the *server* deciding it: a client that picks its own
 * key could claim one that collides with another account's, and while the
 * unique index would reject the write, letting callers probe which keys exist
 * is a needless side channel.
 *
 * 12 hex characters, matching what the app rendered before this moved
 * server-side, so existing DSNs keep their shape.
 */
function generatePublicKey() {
  return $security.randomStringWithAlphabet(12, '0123456789abcdef')
}

module.exports = { requireOwnedProject, generatePublicKey }
