import { useId } from 'react'
import type { ReactNode } from 'react'

// What a form control needs to be linked to its label, hint and error message.
export type FieldControlProps = {
  id: string
  'aria-invalid'?: true
  'aria-describedby'?: string
}

type FieldProps = {
  label: string
  hint?: string
  // The server's messages for this field, e.g. error.fieldErrors.email (N5.4).
  errors?: string[]
  children: (control: FieldControlProps) => ReactNode
}

// The frame every form control shares, so TextField, SelectField and later ones look and
// behave the same: label above, hint and error below, all linked for screen readers.
export function Field({ label, hint, errors = [], children }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const hasErrors = errors.length > 0
  const describedBy = [hint && hintId, hasErrors && errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className="grid grid-cols-1">
      <label htmlFor={id} className="ds-field-label">
        {label}
      </label>
      {children({ id, 'aria-invalid': hasErrors || undefined, 'aria-describedby': describedBy })}
      {hint && (
        <p id={hintId} className="mt-2 text-sm text-muted">
          {hint}
        </p>
      )}
      {hasErrors && (
        <p id={errorId} className="ds-field-error">
          {errors.map(capitalize).join('. ')}
        </p>
      )}
    </div>
  )
}

// The services phrase field errors as "must be at least 8 characters".
function capitalize(message: string): string {
  return message.charAt(0).toUpperCase() + message.slice(1)
}