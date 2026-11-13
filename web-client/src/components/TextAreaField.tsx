import { Field } from './Field'

type TextAreaFieldProps = {
  label: string
  name: string
  value: string
  onChange: (value: string) => void
  errors?: string[]
  hint?: string
  // Visible lines; the field can be dragged taller.
  rows?: number
  // Shows "23 / 500 characters" under the field. A guide only: nothing is cut off or refused here,
  // the service decides what is too long (N5.4).
  characterLimit?: number
}

export function TextAreaField({ label, name, value, onChange, errors, hint, rows = 4, characterLimit }: TextAreaFieldProps) {
  // Counted after trimming, like the services count, so the number matches their verdict.
  const count = characterLimit === undefined ? undefined : `${value.trim().length} / ${characterLimit} characters`

  return (
    <Field label={label} hint={[hint, count].filter(Boolean).join(' · ') || undefined} errors={errors}>
      {(control) => (
        <textarea
          {...control}
          name={name}
          rows={rows}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="ds-field block resize-y"
        />
      )}
    </Field>
  )
}
