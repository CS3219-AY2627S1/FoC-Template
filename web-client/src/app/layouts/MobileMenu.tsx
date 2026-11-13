import { Menu, X } from 'lucide-react'
import { useLocation } from 'react-router'
import { useId, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { Brand } from './Brand'

type MobileMenuProps = {
  // Shown under the wordmark, e.g. "Admin console".
  label: string
  // What the menu opens: the navigation and the actions below it.
  children: ReactNode
}

// The top bar below lg for a navigation with too many entries for a tab bar. The menu opens
// in the page flow and pushes the page down, so it covers nothing and needs no focus trap.
export function MobileMenu({ label, children }: MobileMenuProps) {
  const location = useLocation()
  // The page the menu was opened on. Every navigation gets a new location key, so the next
  // page starts with the menu closed.
  const [openOn, setOpenOn] = useState<string>()
  const open = openOn === location.key
  const panelId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Escape closes the open menu and puts the focus back on its button.
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !open) return
    setOpenOn(undefined)
    buttonRef.current?.focus()
  }

  // A chosen link closes the menu by navigating. The focus moves to the button first, so it
  // is not lost when the link is hidden.
  function handlePanelClick(event: MouseEvent) {
    if (event.target instanceof Element && event.target.closest('a')) buttonRef.current?.focus()
  }

  return (
    <header className="glass border-b border-border-glass bg-surface-chrome px-4 py-3 md:px-8" onKeyDown={handleKeyDown}>
      <div className="flex items-center justify-between gap-3">
        <Brand label={label} />
        <button
          ref={buttonRef}
          type="button"
          className="ds-btn ds-btn--glass shrink-0"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpenOn(open ? undefined : location.key)}
        >
          {open ? <X aria-hidden="true" className="size-5 shrink-0" /> : <Menu aria-hidden="true" className="size-5 shrink-0" />}
          Menu
        </button>
      </div>
      <div id={panelId} hidden={!open} className="mt-4 grid grid-cols-1 gap-3 pb-1" onClick={handlePanelClick}>
        {children}
      </div>
    </header>
  )
}
