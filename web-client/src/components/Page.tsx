import type { ReactNode } from 'react'

type PageProps = {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
}

export function Page({ title, subtitle, actions, children }: PageProps) {
  return (
    <>
      {/* One string, not "{title} · Relay": React only writes a <title> whose child is a single string. */}
      <title>{`${title} · Relay`}</title>
      <header className="mx-auto flex w-full max-w-layout items-end justify-between gap-4 px-4 pt-8 md:px-8 md:pt-10">
        <div className="min-w-0">
          <h1>{title}</h1>
          {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <div className="mx-auto grid w-full max-w-layout grid-cols-1 gap-4 px-4 py-6 md:px-8">{children}</div>
    </>
  )
}