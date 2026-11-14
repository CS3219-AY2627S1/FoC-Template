/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: Created a reusable portal-based action menu per instructions.md Stage 21a, to replace
 *        row-action dropdowns that were clipped by an `overflow-x: auto` ancestor. Renders via
 *        createPortal into document.body, positions itself with getBoundingClientRect, flips
 *        above the trigger when it would overflow the viewport bottom, and closes on outside
 *        click, Escape, item selection, resize, or scroll.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const MENU_GAP = 4
const VIEWPORT_MARGIN = 8

export default function ActionMenu({ ariaLabel, trigger, items, triggerClassName }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)

  useLayoutEffect(() => {
    if (!open) return undefined

    const place = () => {
      const triggerEl = triggerRef.current
      const menuEl = menuRef.current
      if (!triggerEl || !menuEl) return

      const triggerRect = triggerEl.getBoundingClientRect()
      const menuRect = menuEl.getBoundingClientRect()

      let top = triggerRect.bottom + MENU_GAP
      if (top + menuRect.height > window.innerHeight - VIEWPORT_MARGIN) {
        top = triggerRect.top - MENU_GAP - menuRect.height
      }

      let left = triggerRect.right - menuRect.width
      if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN

      setPosition({ top, left })
    }

    place()

    const close = () => setOpen(false)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return undefined
    }

    const onDocMouseDown = (e) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target) &&
        menuRef.current &&
        !menuRef.current.contains(e.target)
      ) {
        setOpen(false)
      }
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (items.length === 0) return null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: 'fixed',
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              visibility: position ? 'visible' : 'hidden',
            }}
            className="z-50 w-44 overflow-hidden rounded-card border border-line bg-surface shadow-modal"
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  item.onSelect()
                }}
                className={
                  'block w-full px-3 py-2 text-left text-sm hover:bg-surface-alt ' +
                  (item.danger ? 'text-alert' : 'text-ink')
                }
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
