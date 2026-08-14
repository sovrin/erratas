/**
 * Sends anyone not signed in to the login page, remembering where they meant to go.
 *
 * The `next` query is what makes a shared issue link work. Without it, opening
 * `/issues/abc123` while signed out ended at the dashboard after logging in, and
 * the link the sender pasted had silently lost its destination — which is most of
 * the point of an issue having an address at all.
 *
 * Only paths are carried, never a full URL: `next` comes from the address bar and
 * ends up in a `navigateTo`, so accepting `//evil.example` or `https://…` here
 * would turn the login page into an open redirect. `app/pages/login.vue` checks
 * the same property again before using it, because a guard the destination does
 * not re-check is a guard that stops applying the moment somebody adds a second
 * way in.
 */
export default defineNuxtRouteMiddleware((to) => {
  if (to.path === '/login') return

  const { isLoggedIn } = useAuth()
  if (isLoggedIn.value) return

  // The bare dashboard is the default landing place, so remembering it would add
  // a query string that changes nothing.
  if (to.fullPath === '/') return navigateTo('/login')

  return navigateTo({ path: '/login', query: { next: to.fullPath } })
})
