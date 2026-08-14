/**
 * Click once to arm, click again to confirm — and forget after a few seconds.
 *
 * Used for deleting a project. A native `confirm()` would do the job, but it
 * throws a system dialog over a design that has none, and a custom modal is a
 * lot of machinery for one destructive button. Arming keeps the confirmation in
 * the same place as the action, which is also where the reader is looking.
 *
 * The timeout matters: an armed button left armed indefinitely turns the next
 * accidental click, minutes later, into a deletion.
 */
export function useArmedAction(action: () => void | Promise<void>, armedForMs = 3000) {
  const armed = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null

  function disarm() {
    armed.value = false
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  async function trigger() {
    if (!armed.value) {
      armed.value = true
      timer = setTimeout(disarm, armedForMs)
      return
    }

    disarm()
    await action()
  }

  onScopeDispose(disarm)

  return { armed, trigger, disarm }
}
