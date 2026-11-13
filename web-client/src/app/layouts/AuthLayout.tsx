import { Outlet } from 'react-router'
import { Logo } from './Logo'

// The frame of the signed-out pages: a narrow centred column with the brand card on top and the
// page's own card below it.
export function AuthLayout() {
  return (
    <main id="main" className="mx-auto grid min-h-dvh w-full max-w-md grid-cols-1 content-center gap-4 px-4 py-12">
      <div className="ds-surface flex items-center gap-3 px-5 py-3">
        <Logo />
        <p className="min-w-0 text-xl font-semibold tracking-tight">Relay</p>
      </div>
      <Outlet />
    </main>
  )
}
