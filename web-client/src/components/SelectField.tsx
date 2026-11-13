import { Field } from './Field'

export type SelectOption = {
  value: string
  label: string
}

type SelectFieldProps = {
  label: string
  name: string
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  errors?: string[]
  hint?: string
}

export function SelectField({ label, name, value, onChange, options, errors, hint }: SelectFieldProps) {
  return (
    <Field label={label} hint={hint} errors={errors}>
      {(control) => (
        <div className="relative">
          <select
            {...control}
            name={name}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="ds-field ds-select"
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      )}
    </Field>
  )
}