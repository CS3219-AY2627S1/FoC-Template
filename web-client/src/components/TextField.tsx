import { Field } from './Field'

type TextFieldProps = {
  label: string
  name: string
  value: string
  onChange: (value: string) => void
  errors?: string[]
  hint?: string
  type?: 'text' | 'email' | 'password' | 'search' | 'tel' | 'url' | 'datetime-local'
  autoComplete?: string
  inputMode?: 'text' | 'email' | 'numeric' | 'tel' | 'search' | 'url'
}

export function TextField({
  label,
  name,
  value,
  onChange,
  errors,
  hint,
  type = 'text',
  autoComplete,
  inputMode,
}: TextFieldProps) {
  return (
    <Field label={label} hint={hint} errors={errors}>
      {(control) => (
        <input
          {...control}
          name={name}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          inputMode={inputMode}
          className="ds-field"
        />
      )}
    </Field>
  )
}