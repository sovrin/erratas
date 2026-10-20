import { announceChange } from '#nexitas/server/utils/changes'
import { nexitasDatabase } from '#nexitas/server/utils/nexitas'
import { deleteStack } from '../../../../core/issues'
import { routeStack } from '../../../../utils/erratas'

/** Deletes a stack and its issues; apps reporting with its DSN get a 401 from then on. */
export default defineEventHandler((event) => {
  deleteStack(nexitasDatabase(), routeStack(event).id)
  announceChange()
  return { ok: true }
})
