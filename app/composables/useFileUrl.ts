import type { RecordModel } from 'pocketbase'

const fileToken = () => useState<string>('pb-file-token', () => '')

export function useFileUrl() {
  const pb = usePocketbase()
  const token = fileToken()

  async function refreshToken() {
    if (!pb.authStore.isValid) {
      token.value = ''
      return
    }
    token.value = await pb.files.getToken()
  }

  function fileUrl(record: RecordModel, filename: string, opts?: { thumb?: string }) {
    if (!filename) return ''
    return pb.files.getURL(record, filename, { token: token.value, ...opts })
  }

  return { token, refreshToken, fileUrl }
}
