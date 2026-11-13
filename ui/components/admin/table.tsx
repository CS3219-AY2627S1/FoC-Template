// AI-assisted (Claude), reviewed and tested by Maliha
// Shared bits for the admin tables

export const thCls = "text-left px-4 py-3 text-[11px] font-semibold text-[#3F6B5A] uppercase tracking-wider whitespace-nowrap border-b border-[#E4E8E6]"
export const tdCls = "px-4 py-3 text-xs text-[#1B2522]"
export const inputCls = "w-full px-3.5 py-2.5 border border-[#E4E8E6] rounded-lg text-sm text-[#1B2522] bg-white focus:outline-none focus:border-[#1A4A36] focus:ring-1 focus:ring-[#1A4A36] transition-colors"

// Loading / error / empty row, spanning the whole table
export function TableMessage({ colSpan, loading, loadingText, error, onRetry, emptyText }: {
  colSpan: number
  loading: boolean
  loadingText: string
  error: string
  onRetry: () => void
  emptyText: string
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-xs text-[#3F6B5A]">
        {loading ? loadingText : error ? (
          <>
            <p className="text-red-600 mb-2">{error}</p>
            <button onClick={onRetry} className="font-semibold text-[#1A4A36] underline">Try again</button>
          </>
        ) : emptyText}
      </td>
    </tr>
  )
}