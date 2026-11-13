import type { ChangeEventHandler, ReactNode } from 'react'
import styles from './DirectoryComponents.module.css'

interface FieldProps {
  id: string
  label: string
  children: ReactNode
}

export function Field({ id, label, children }: FieldProps) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  )
}

interface SelectFieldProps {
  id: string
  label: string
  value: string
  onChange: ChangeEventHandler<HTMLSelectElement>
  children: ReactNode
}

export function SelectField({
  id,
  label,
  value,
  onChange,
  children,
}: SelectFieldProps) {
  return (
    <Field id={id} label={label}>
      <select id={id} onChange={onChange} value={value}>
        {children}
      </select>
    </Field>
  )
}

interface ButtonProps {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  type?: 'button' | 'submit'
  disabled?: boolean
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  disabled = false,
}: ButtonProps) {
  return (
    <button
      className={
        variant === 'primary'
          ? styles.primaryButton
          : variant === 'danger'
            ? styles.dangerButton
            : styles.button
      }
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  )
}
