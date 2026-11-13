export function navigateTo(path: string) {
  window.location.assign(path)
}

/** Login page that returns the user to the errand page they were on. */
export function signInPath(returnTo = window.location.pathname) {
  return `/?returnTo=${encodeURIComponent(returnTo)}`
}
