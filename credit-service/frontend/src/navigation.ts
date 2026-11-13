export function navigateTo(path: string) {
  window.location.assign(path)
}

export function signInPath() {
  return `/?returnTo=${encodeURIComponent('/credits')}`
}
