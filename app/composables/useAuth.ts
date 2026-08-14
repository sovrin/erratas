import type { Users } from '#shared/pocketbase/tsSchema'

export function useAuth() {
  const pb = usePocketbase()
  const user = useState<Users | null>('auth-user')

  async function signIn(email: string, password: string) {
    await pb.collection('users').authWithPassword(email, password)
  }

  async function signUp(email: string, password: string, name: string) {
    await pb.collection('users').create({
      email,
      password,
      passwordConfirm: password,
      name,
    })
    await signIn(email, password)
  }

  function signOut() {
    pb.authStore.clear()
  }

  async function updateProfile(data: Partial<Pick<Users, 'name' | 'avatar'>>) {
    if (!user.value) return
    await pb.collection('users').update(user.value.id, data)
    await pb.collection('users').authRefresh()
  }

  return {
    user,
    isLoggedIn: computed(() => !!user.value),
    signIn,
    signUp,
    signOut,
    updateProfile,
  }
}
