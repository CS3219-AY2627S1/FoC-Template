import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'

// Sticks to the top of the screen while the conversation scrolls, like the composer at the bottom.
export function BackToMessages() {
  return (
    <Link to="/message" className="ds-btn ds-btn--glass sticky top-4 z-10 justify-self-start">
      <ArrowLeft aria-hidden="true" className="size-5 shrink-0" />
      Messages
    </Link>
  )
}
