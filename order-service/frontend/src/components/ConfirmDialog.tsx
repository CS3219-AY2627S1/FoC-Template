import { useEffect, useRef } from 'react'

/** Native modal dialog: focus moves into it, Escape cancels, and focus returns afterwards. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal?.()
    if (!open && dialog.open) dialog.close?.()
  }, [open])
  return (
    <dialog aria-labelledby="confirm-title" className="confirm" onCancel={onCancel} ref={ref}>
      <h2 id="confirm-title">{title}</h2>
      <p className="subtle">{body}</p>
      <div className="actions">
        <button aria-busy={busy} disabled={busy} onClick={onConfirm} type="button">
          {confirmLabel}
        </button>
        <button className="button-secondary" disabled={busy} onClick={onCancel} type="button">
          Not now
        </button>
      </div>
    </dialog>
  )
}
