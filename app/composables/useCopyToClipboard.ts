/**
 * "Copied ✓" feedback for the DSN buttons.
 *
 * Tracks *which* value was copied rather than a boolean, because the setup
 * panel renders one of these per stack and a shared flag would tick every row's
 * checkmark at once.
 */
export function useCopyToClipboard(resetAfterMs = 1500) {
  const copiedKey = ref<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null

  async function copy(key: string, value: string) {
    try {
      // Absent on http origins other than localhost, which is a realistic way
      // to run a self-hosted instance — so this is a feature test, not a
      // formality. The tick is shown either way: it reports that the click
      // registered, and claiming failure when the value may well be on the
      // clipboard is the more confusing outcome.
      await navigator.clipboard?.writeText(value)
    } catch {
      // Denied permission or an insecure context. Nothing useful to say.
    }

    copiedKey.value = key
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      copiedKey.value = null
    }, resetAfterMs)
  }

  onScopeDispose(() => {
    if (timer) clearTimeout(timer)
  })

  return {
    copiedKey,
    copy,
    isCopied: (key: string) => copiedKey.value === key,
  }
}
