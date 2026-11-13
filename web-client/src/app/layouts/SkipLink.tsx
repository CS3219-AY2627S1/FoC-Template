import type { MouseEvent } from 'react'

// Lets keyboard users jump past the navigation straight to the page. It stays invisible
// until it gets focus, which is the first Tab press on every page.
export function SkipLink() {
  function skip(event: MouseEvent<HTMLAnchorElement>) {
    const main = document.getElementById('main')
    if (!main) return
    event.preventDefault()
    // Focusable from code only, so <main> does not become an extra stop in the tab order.
    main.tabIndex = -1
    main.focus()
  }

  return (
    <a
      href="#main"
      onClick={skip}
      className="ds-btn ds-btn--primary sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-5 focus:py-3"
    >
      Skip to content
    </a>
  )
}
