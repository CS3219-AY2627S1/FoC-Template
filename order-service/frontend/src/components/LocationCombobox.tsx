import { ChevronDown } from 'lucide-react'
import {
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { CampusLocation } from '../api/sharedApi'
import { locationLabel } from '../utils/errandForm'

const EMPTY_LABEL = 'Choose a location'

/**
 * A searchable campus-location picker (ARIA combobox with a listbox popup). Typing filters by name,
 * building or level; arrow keys move, Enter picks, Escape closes. The value is the Supplier location
 * ID, or '' for none, exactly as the native select it replaces.
 */
export function LocationCombobox({
  id,
  value,
  onChange,
  locations,
  invalid,
  describedBy,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  locations: CampusLocation[] | undefined
  invalid: boolean
  describedBy?: string
}) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const selected = locations?.find((location) => location.id === value)
  const options = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const matches = (locations ?? []).filter((location) => {
      const text = locationLabel(location).toLowerCase()
      return words.every((word) => text.includes(word))
    })
    // The empty choice stays first while browsing, but not while searching.
    return words.length === 0 ? [null, ...matches] : matches
  }, [locations, query])

  useEffect(() => {
    if (!open) return
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView?.({ block: 'nearest' })
  }, [active, open])

  const openList = () => {
    if (!locations) return
    const current = options.findIndex((option) => (option?.id ?? '') === value)
    setActive(Math.max(0, current))
    setOpen(true)
  }

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  const choose = (option: CampusLocation | null) => {
    onChange(option?.id ?? '')
    close()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        openList()
        return
      }
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((index) =>
        Math.min(Math.max(index + step, 0), Math.max(options.length - 1, 0)),
      )
    } else if (event.key === 'Enter') {
      if (open && options.length > 0) {
        event.preventDefault()
        choose(options[Math.min(active, options.length - 1)] ?? null)
      }
    } else if (event.key === 'Escape') {
      if (open) {
        event.preventDefault()
        close()
      }
    }
  }

  const shown = open ? query : selected ? locationLabel(selected) : ''
  const activeOption =
    open && options.length > 0 ? `${listId}-${active}` : undefined

  return (
    <div className="combobox">
      <input
        aria-activedescendant={activeOption}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-describedby={describedBy}
        aria-expanded={open}
        aria-invalid={invalid}
        autoComplete="off"
        disabled={!locations}
        id={id}
        onBlur={close}
        onChange={(event) => {
          // Typing while closed shows the chosen label, so the first key replaces it with a new search.
          const typed = event.target.value
          setQuery(
            open || !selected
              ? typed
              : typed.slice(locationLabel(selected).length),
          )
          setActive(0)
          setOpen(true)
        }}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        placeholder={locations ? EMPTY_LABEL : 'Loading locations…'}
        ref={inputRef}
        role="combobox"
        spellCheck={false}
        type="text"
        value={shown}
      />
      <ChevronDown aria-hidden="true" className="combobox-arrow" />
      {open && (
        <ul className="combobox-list" id={listId} ref={listRef} role="listbox">
          {options.length === 0 ? (
            <li className="combobox-empty">No matching locations</li>
          ) : (
            options.map((option, index) => (
              <li
                aria-selected={(option?.id ?? '') === value}
                className={
                  index === active
                    ? 'combobox-option is-active'
                    : 'combobox-option'
                }
                data-index={index}
                id={`${listId}-${index}`}
                key={option?.id ?? 'none'}
                // Keep focus in the input so the list does not close before the click lands.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
                onMouseEnter={() => setActive(index)}
                role="option"
              >
                {option ? locationLabel(option) : EMPTY_LABEL}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
