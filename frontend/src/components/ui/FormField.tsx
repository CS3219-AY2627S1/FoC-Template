/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-17
 * Scope (AI-18): Built and tested the requested errand creation preview and entry points.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 */

import type { ReactNode } from 'react'

type FormFieldProps = {
  children: ReactNode
  error?: string
  hint?: string
  htmlFor: string
  label: string
  required?: boolean
}

export function FormField({
  children,
  error,
  hint,
  htmlFor,
  label,
  required = false,
}: FormFieldProps) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="mb-2 block text-sm font-medium text-[#17211d]">
        {label}
        {required ? <span className="ml-1 text-[#b42318]">*</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="mt-1.5 text-xs leading-5 text-[#b42318]" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="mt-1.5 text-xs leading-5 text-[#68736c]">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
