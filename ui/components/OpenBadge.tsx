// Open / Closed pill from the supplier's isOpen flag
export default function OpenBadge({ isOpen }: { isOpen: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${
        isOpen ? "bg-[#E8F1ED] text-[#1A4A36]" : "bg-gray-100 text-gray-500"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? "bg-[#2F8F5B]" : "bg-gray-400"}`} />
      {isOpen ? "Open" : "Closed"}
    </span>
  )
}
