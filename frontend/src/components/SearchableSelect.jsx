/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-08
 * Scope: Implemented searchable single and multiple selection controls requested in chat.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-08): Fixed selection display and dismissal, and showed active multi-selections.
 * Author review: Congchen
 */
import { Children, useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'

function textOf(children) {
  return Children.toArray(children).map((child) => typeof child === 'object' ? textOf(child.props.children) : String(child)).join('')
}

export default function SearchableSelect({ children, value, onChange, multiple = false, className = '', id, ...props }) {
  const options = Children.toArray(children).filter((child) => child.type === 'option').map((child) => ({
    value: String(child.props.value ?? textOf(child.props.children)),
    label: textOf(child.props.children), disabled: child.props.disabled,
  }))
  const selected = multiple ? value.map(String) : [String(value ?? '')]
  const selectedLabel = options.filter((option) => selected.includes(option.value)).map((option) => option.label).join(', ')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1)
  const listId = useId()
  const filtered = options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()))
  const choose = (option) => {
    if (option.disabled) return
    if (multiple) {
      const next = selected.includes(option.value) ? selected.filter((v) => v !== option.value) : [...selected, option.value]
      onChange({ target: { selectedOptions: next.map((v) => ({ value: v })) } })
    } else {
      onChange({ target: { value: option.value } })
      setOpen(false)
      setQuery('')
    }
    setActive(-1)
  }
  const close = () => { setOpen(false); setQuery(''); setActive(-1) }
  return (
    <div className="relative min-w-0" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) close() }}>
      <input
        {...props} id={id} role="combobox" aria-expanded={open} aria-controls={listId}
        aria-autocomplete="list" aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        className={`${className} w-full pr-9`}
        value={open ? query : selectedLabel}
        onFocus={() => { setOpen(true); setQuery('') }}
        onClick={() => setOpen(true)}
        onChange={(event) => { setQuery(event.target.value); setActive(-1); setOpen(true) }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') { close(); return }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true)
            const direction = event.key === 'ArrowDown' ? 1 : -1
            let index = active
            for (let i = 0; i < filtered.length; i++) {
              index = (index + direction + filtered.length) % filtered.length
              if (!filtered[index].disabled) { setActive(index); break }
            }
          } else if (event.key === 'Enter' && open && active >= 0) {
            event.preventDefault(); choose(filtered[active])
          }
        }}
      />
      <ChevronDown aria-hidden="true" size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-70" />
      {open && <div id={listId} role="listbox" aria-multiselectable={multiple || undefined} className="absolute z-50 mt-1 max-h-60 w-full min-w-48 overflow-auto rounded-xl border border-line bg-surface p-1 shadow-lg">
        {multiple && selectedLabel && <div aria-live="polite" className="border-b border-line px-3 py-2 text-xs text-ink-70">Selected: {selectedLabel}</div>}
        {filtered.length === 0 && <div className="px-3 py-2 text-sm text-ink-40">No options found</div>}
        {filtered.map((option, index) => <div
          id={`${listId}-${index}`} key={option.value} role="option" aria-selected={selected.includes(option.value)} aria-disabled={option.disabled || undefined}
          onMouseDown={(event) => event.preventDefault()} onClick={(event) => { if (!multiple) event.preventDefault(); choose(option) }} onMouseEnter={() => setActive(index)}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${option.disabled ? 'cursor-not-allowed text-ink-40' : 'cursor-pointer text-ink hover:bg-surface-alt'} ${active === index ? 'bg-surface-alt' : ''}`}
        >{multiple && <input type="checkbox" tabIndex={-1} aria-label={option.label} checked={selected.includes(option.value)} readOnly className="h-4 w-4 rounded accent-orange" />}{option.label}</div>)}
      </div>}
    </div>
  )
}
