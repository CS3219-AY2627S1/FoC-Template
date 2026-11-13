import type { ReactNode } from 'react'

type SubmitButtonProps = {
  pending: boolean
  // Shown while the request runs, e.g. "Creating account…".
  pendingLabel?: string
  children: ReactNode
}

// Unusable while pending, so a second click or Enter cannot send the form twice. aria-disabled
// instead of disabled: a disabled button drops keyboard focus to the top of the page, and when the
// service refuses the form, the user would have to find their way back to it.
export function SubmitButton({ pending, pendingLabel, children }: SubmitButtonProps) {
  return (
    <button
      type="submit"
      aria-disabled={pending || undefined}
      aria-busy={pending || undefined}
      // Enter in a field submits through a click on this button as well, so this stops both.
      onClick={(event) => {
        if (pending) event.preventDefault()
      }}
      className="ds-btn ds-btn--primary w-full"
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  )
}
