import { useEffect, useRef, type ReactNode } from 'react'
import styles from './Modal.module.css'

type Props = {
  id: string
  labelledBy: string
  onClose: () => void
  busy?: boolean
  children: ReactNode
}

export const Modal = ({ id, labelledBy, onClose, busy = false, children }: Props) => {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current!
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [])

  return <dialog id={id} ref={ref} className={styles.modal} aria-labelledby={labelledBy} aria-busy={busy}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}
    onClick={(event) => {
      if (busy || event.target !== event.currentTarget) return
      const bounds = event.currentTarget.getBoundingClientRect()
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose()
    }}>
    {children}
  </dialog>
}
