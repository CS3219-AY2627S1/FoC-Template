import { useEffect, useState } from 'react'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { Field } from './DirectoryControls'

interface DebouncedSearchFieldProps {
  id: string
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
}

export function DebouncedSearchField({
  id,
  label,
  placeholder,
  value,
  onChange,
}: DebouncedSearchFieldProps) {
  const [inputValue, setInputValue] = useState(value)
  const debouncedValue = useDebouncedValue(inputValue, 300)

  useEffect(() => {
    const normalized = debouncedValue.trim()
    if (normalized !== value) onChange(normalized)
  }, [debouncedValue, onChange, value])

  return (
    <Field id={id} label={label}>
      <input
        autoComplete="off"
        id={id}
        onChange={(event) => setInputValue(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={inputValue}
      />
    </Field>
  )
}
