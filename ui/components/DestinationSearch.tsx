// AI Assistance Disclosure: ChatGPT (Codex), 2026-11-02.
// Scope: Searchable catalogue selection for the create form; review pending.
// See ../../order-service/usage-log.md.
import { useEffect, useId, useState } from 'react'
import { searchLocations, type DestinationLocation } from '../api/locations'

export function DestinationSearch({ value, onSelect }: { value: DestinationLocation | null; onSelect: (location: DestinationLocation | null) => void }) {
  const id = useId()
  const [query, setQuery] = useState(value?.name ?? '')
  const [selected, setSelected] = useState<DestinationLocation | null>(value)
  const [results, setResults] = useState<DestinationLocation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!query.trim() || selected) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setLoading(true)
      searchLocations(query.trim(), controller.signal)
        .then(locations => { if (!controller.signal.aborted) setResults(locations) })
        .catch(() => { if (!controller.signal.aborted) setError('Unable to search locations. Please try again.') })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query, selected])
  return <div>
    <label htmlFor={id} className="block text-xs font-medium mb-1.5">Delivery location</label>
    <input id={id} value={query} autoComplete="off" placeholder="Search buildings by name or alias"
      aria-describedby={`${id}-help`}
      className="w-full px-3.5 py-2.5 border rounded-lg text-sm"
      onChange={event => {
        setQuery(event.target.value); setSelected(null); onSelect(null)
        setResults([]); setError(''); setLoading(!!event.target.value.trim())
      }} />
    <p id={`${id}-help`} className="text-xs text-gray-500 mt-1">Select a building below. Add room or meeting-point details in your instructions.</p>
    <div role="status" className="text-xs mt-1">
      {selected ? `Selected: ${selected.name}` : error || (loading ? 'Searching…' : query.trim() && !results.length ? 'No matching buildings.' : '')}
    </div>
    {!selected && results.length > 0 && <ul aria-label="Matching buildings" className="border rounded-lg max-h-48 overflow-auto mt-1">
      {results.map(location => <li key={location.id}><button type="button"
        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 focus:bg-gray-100"
        onClick={() => { setSelected(location); setQuery(location.name); setResults([]); setLoading(false); onSelect(location) }}>
        {location.name}{location.code && location.code !== location.name ? ` (${location.code})` : ''}
      </button></li>)}
    </ul>}
  </div>
}
