import { ArrowLeft } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router'

type BackButtonProps = {
  // Where to go when the page was opened without a link that says where it came from,
  // for example from a bookmark or in a new tab.
  fallbackTo: string
  fallbackLabel: string
}

// A link into a detail page can pass { backLabel } in the router state. Going back then returns to
// exactly that page through the browser history, with its filters, page and scroll position.
export function BackButton({ fallbackTo, fallbackLabel }: BackButtonProps) {
  const backLabel = (useLocation().state as { backLabel?: string } | null)?.backLabel
  const navigate = useNavigate()

  if (backLabel) {
    return (
      <button type="button" className="ds-btn ds-btn--glass" onClick={() => navigate(-1)}>
        <ArrowLeft aria-hidden="true" className="size-5 shrink-0" />
        {backLabel}
      </button>
    )
  }

  return (
    <Link to={fallbackTo} className="ds-btn ds-btn--glass">
      <ArrowLeft aria-hidden="true" className="size-5 shrink-0" />
      {fallbackLabel}
    </Link>
  )
}
