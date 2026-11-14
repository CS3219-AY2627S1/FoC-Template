/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Created a presentational component that renders a supplier's `categories` array as
 *        pills, per the team's resolution that the frontend shows multiple categories. Visual
 *        implementation only. No requirements, architecture, schema, or API decisions were made
 *        by the AI tool.
 * Author review: Congchen
  *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Supplier objects now carry location_id, faculty_id and categories as {category, category_id} objects. Per the team's decision in chat;
 *        no other requirements, architecture, schema, or API decisions were made by the
 *        AI tool.
 * Author review:
 */

// One pill per entry in `categories`, each `{ category, category_id }` (SupplierSummary, §7.3).
export default function CategoryPills({ categories = [], className = '' }) {
  if (!categories.length) return null
  return (
    <ul className={'flex flex-wrap gap-1.5 ' + className} aria-label="Categories">
      {categories.map(({ category, category_id }) => (
        <li
          key={category_id}
          className="inline-flex h-6 items-center rounded-pill border border-line bg-surface-alt px-2.5 text-xs font-medium text-ink-70"
        >
          {category}
        </li>
      ))}
    </ul>
  )
}
