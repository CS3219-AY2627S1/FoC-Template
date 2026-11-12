/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-03
 * Scope (AI-02): Adjusted existing UI styling to match the supplied Figma mockup.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 */

import type { ComponentPropsWithoutRef } from 'react'
import searchIcon from '../../assets/search.svg'

type SearchInputProps = ComponentPropsWithoutRef<'input'> & { label?: string }

export function SearchInput({ label = 'Search', className = '', ...props }: SearchInputProps) {
  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <img
        src={searchIcon}
        alt=""
        width="18"
        height="18"
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2"
      />
      <input
        type="search"
        className={`h-12 w-full rounded-xl border border-[#dde3de] bg-white py-3 pl-11 pr-4 text-sm text-[#17211d] outline-none transition placeholder:text-[#7e8982] focus:border-[#175c45] focus:ring-4 focus:ring-[#175c45]/10 ${className}`}
        {...props}
      />
    </label>
  )
}
