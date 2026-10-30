// Loading / error placeholder shown while a page fetches its data
export default function LoadMessage({ error, onRetry }: { error?: string; onRetry?: () => void }) {
  if (!error) return <p className="py-16 text-center text-sm text-[#3F6B5A]">Loading…</p>

  return (
    <div className="py-16 text-center">
      <p className="mb-1 text-sm font-medium text-[#162A46]">Couldn't load this</p>
      <p className="text-xs text-[#3F6B5A]">{error}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-3 text-xs font-semibold text-[#1A4A36] underline">
          Try again
        </button>
      )}
    </div>
  )
}