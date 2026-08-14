export default defineNuxtRouteMiddleware((to) => {
  if (to.path === '/login') return
  const { isLoggedIn } = useAuth()
  if (!isLoggedIn.value) return navigateTo('/login')
})
