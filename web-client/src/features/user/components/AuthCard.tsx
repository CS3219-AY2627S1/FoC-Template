import type { ReactNode } from 'react'

type AuthCardProps = {
  // The page heading inside the card, also the tab title.
  title: string
  children: ReactNode
  // A line below the card, e.g. the link to the other signed-out page.
  footer?: ReactNode
}

// The signed-out pages (log in, sign up, verify) show their heading inside one card under the
// brand card of AuthLayout, instead of the page header that Page draws for the app.
export function AuthCard({ title, children, footer }: AuthCardProps) {
  return (
    <>
      {/* One string, not "{title} · Relay": React only writes a <title> whose child is a single string. */}
      <title>{`${title} · Relay`}</title>
      <section className="ds-surface grid grid-cols-1 gap-5 p-5">
        <h1 className="text-2xl">{title}</h1>
        {children}
      </section>
      {footer && <p className="text-center text-muted">{footer}</p>}
    </>
  )
}
