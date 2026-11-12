/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-11-10
 * Scope (AI-28): Generated the account list endpoint, admin users page and their tests.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

import { useEffect, useRef, type ReactNode } from 'react'
import { PAGE_SIZE } from './admin.utils'

// Building blocks shared by the admin dashboard sections (styles in pages/AdminPage.css)

export function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close() }, [])
  return <dialog ref={ref} className="admin-dialog" aria-labelledby="admin-dialog-title" onCancel={close}>
    <div className="admin-dialog-head"><h2 id="admin-dialog-title">{title}</h2><button type="button" aria-label="Close dialog" onClick={close}>×</button></div>{children}
  </dialog>
}

export function Badge({ status }: { status: string }) {
  return <span className={`admin-badge admin-badge-${status.toLowerCase()}`}>{status}</span>
}

export function Pagination({ page, totalItems, onChange }: { page: number; totalItems: number; onChange: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  if (totalPages <= 1) return null
  return <nav className="admin-pagination" aria-label="Directory pages">
    <button type="button" disabled={page === 0} onClick={() => onChange(page - 1)}>Previous</button>
    <span>Page {page + 1} of {totalPages}</span>
    <button type="button" disabled={page >= totalPages - 1} onClick={() => onChange(page + 1)}>Next</button>
  </nav>
}
