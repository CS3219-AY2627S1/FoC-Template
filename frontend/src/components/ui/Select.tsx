/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-03
 * Scope (AI-02): Adjusted existing UI styling to match the supplied Figma mockup.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 */

import type { ComponentPropsWithoutRef } from 'react'

type SelectOption = { label: string; value: string }

type SelectProps = ComponentPropsWithoutRef<'select'> & {
  label: string
  options: SelectOption[]
}

export function Select({ label, options, className = '', ...props }: SelectProps) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <select
        className={`h-12 w-full cursor-pointer rounded-xl border border-[#dde3de] bg-white px-3.5 text-sm text-[#17211d] outline-none transition focus:border-[#175c45] focus:ring-4 focus:ring-[#175c45]/10 ${className}`}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
