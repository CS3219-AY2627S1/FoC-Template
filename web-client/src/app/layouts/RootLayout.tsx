import { Outlet, ScrollRestoration } from 'react-router'
import { OverflowWarning } from '../dev/OverflowWarning'
import { SkipLink } from './SkipLink'

export function RootLayout() {
  return (
    <>
      <SkipLink />
      <Outlet />
      {/* A new page starts at the top, and back/forward return to where the user was. */}
      <ScrollRestoration />
      {import.meta.env.DEV && <OverflowWarning />}
    </>
  )
}
