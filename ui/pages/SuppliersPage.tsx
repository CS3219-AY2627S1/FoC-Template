// AI-assisted (Claude), reviewed and tested by Maliha
import type { ReactElement } from "react"
import { CATEGORIES, categoryLabel, supplierLocation, type Category } from "../api/suppliers"
import { useSuppliers } from "../hooks/useSuppliers"
import LoadMessage from "../components/LoadMessage"

const TYPE_COLORS: Record<Category, string> = {
  "food/coffee": "bg-orange-50 text-orange-600",
  "food":        "bg-red-50 text-red-600",
  "printing":    "bg-blue-50 text-blue-600",
  "shopping":    "bg-amber-50 text-amber-600",
  "other":       "bg-purple-50 text-purple-600",
}

const TYPE_ICONS: Record<Category, ReactElement> = {
  "food/coffee": (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 9h12v5a5 5 0 01-5 5H9a5 5 0 01-5-5V9zm12 1h1.5a2.5 2.5 0 010 5H16M8 3v3m4-3v3" />
    </svg>
  ),
  "printing": (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 9V3h10v6M7 17H5a2 2 0 01-2-2v-4a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2h-2M7 14h10v7H7v-7z" />
    </svg>
  ),
  "food": (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  ),
  "shopping": (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  ),
  "other": (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
}

export default function SuppliersPage() {
  const { suppliers, error, query, category, search, filter, retry } = useSuppliers()

  return (
    <div className="mx-auto w-full max-w-4xl px-3 py-5 sm:px-6 sm:py-8 lg:px-8">
      <div className="mb-7">
        <h1 className="text-2xl font-semibold text-[#162A46] mb-1">Campus Suppliers</h1>
        <p className="text-sm text-[#3F6B5A]">Stores and services available for errand requests.</p>
      </div>

      {/* Search + filter row */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
          </svg>
          <input
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder="Search suppliers or locations…"
            className="w-full pl-9 pr-3.5 py-2.5 border border-[#E4E8E6] rounded-lg text-sm text-[#1B2522] placeholder-[#9CA3AF] bg-white focus:outline-none focus:border-[#1A4A36] focus:ring-1 focus:ring-[#1A4A36] transition-colors"
          />
        </div>
        <select
          value={category}
          onChange={(e) => filter(e.target.value as Category | "")}
          aria-label="Category"
          className="sm:w-48 px-3.5 py-2.5 border border-[#E4E8E6] rounded-lg text-sm text-[#1B2522] bg-white focus:outline-none focus:border-[#1A4A36] focus:ring-1 focus:ring-[#1A4A36]"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {/* Count */}
      {suppliers && <p className="text-xs text-[#9CA3AF] mb-4">{suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""}</p>}

      {!suppliers || error ? (
        <LoadMessage error={error} onRetry={retry} />
      ) : suppliers.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-12 h-12 bg-[#E8F1ED] rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-5 h-5 text-[#3F6B5A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2 9m13-9l2 9M9 21h6" />
            </svg>
          </div>
          <p className="text-sm font-medium text-[#162A46] mb-1">No suppliers found</p>
          <p className="text-xs text-[#3F6B5A]">Try a different search or filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliers.map((s) => {
            const iconBg = TYPE_COLORS[s.type] ?? TYPE_COLORS.other
            return (
              <div
                key={s.supplierId}
                className="bg-white border border-[#E4E8E6] rounded-xl p-5 hover:border-[#3F6B5A] hover:shadow-sm transition-all"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                    {TYPE_ICONS[s.type] ?? TYPE_ICONS.other}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#162A46] truncate">{s.name}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <svg className="w-3 h-3 text-[#9CA3AF] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      </svg>
                      <p className="text-xs text-[#3F6B5A] truncate">{supplierLocation(s)}</p>
                    </div>
                  </div>
                </div>

                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${iconBg}`}>
                  {categoryLabel(s.type)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}