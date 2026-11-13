import type { ReactNode } from 'react'
import { Page } from './Page'

type PlaceholderPageProps = {
  title: string
  // The service whose team builds the real page, e.g. "supplier-service".
  owner: string
  // The file that replaces this placeholder, so whoever builds it knows where to start.
  file: string
  // Anything that already works on this page, shown below the placeholder.
  children?: ReactNode
}

export function PlaceholderPage({ title, owner, file, children }: PlaceholderPageProps) {
  return (
    <Page title={title} subtitle={`Not built yet. Owned by the ${owner} team.`}>
      <div className="ds-surface grid grid-cols-1 gap-2 p-5">
        <p>Build this page in:</p>
        <code className="font-mono text-sm wrap-anywhere">{file}</code>
      </div>
      <div className="ds-placeholder min-h-40" aria-hidden="true">
        <span>Placeholder</span>
      </div>
      {children}
    </Page>
  )
}