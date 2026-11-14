/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component SupplierDetail.jsx from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: <pending — team member to sign>
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Renders a day-8 opening-hours entry as 'Open 24 hours' (§6.2). No requirements, architecture, schema, or API decisions were
 *        made by the AI tool.
 * Author review: Congchen
  *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: The detail page loads GET /api/v1/suppliers/:id, and the 'Also at' list from the list endpoint filtered by location_id. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: requireLogin replaced with AuthContext's requireAuth, per instructions.md Stage 16b.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import SupplierImage from '../components/SupplierImage'
import CategoryPills from '../components/CategoryPills'
import SupplierCard from '../components/SupplierCard'
import Button from '../components/Button'
import { useApiNotice } from '../components/ApiNotice'
import { useApi } from '../api/useApi'
import { getSupplier, listSuppliers } from '../api/suppliers'
import { DAY_NAMES } from '../data/suppliers'
import { useAuth } from '../context/AuthContext'

// Supplier detail: one supplier as returned by GET /api/v1/suppliers/:id (§7.3). Other
// suppliers at the same location are listed as a view over the flat list. Display only —
// no menus, no items, no cart.
export default function SupplierDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { requireAuth } = useAuth()

  const { data: supplier, loading, error } = useApi(() => getSupplier(id), [id])
  // Other suppliers at the same location, from the list endpoint filtered by location_id.
  const { data: nearby } = useApi(
    () => (supplier ? listSuppliers({ location_id: supplier.location_id }) : Promise.resolve(null)),
    [supplier?.location_id],
  )
  const notice = useApiNotice({ loading, error }, 'this supplier')
  if (error?.status === 404 || error?.status === 422) return <Navigate to="/suppliers" replace />
  if (notice || !supplier) return <div className="page-width page-gutter py-6">{notice}</div>

  const siblings = (nearby?.data ?? []).filter((s) => s.id !== supplier.id)

  const requestFromHere = () =>
    requireAuth('You need an account to post an errand.', () =>
      navigate('/requests/new?supplier=' + supplier.id),
    )

  return (
    <div className="page-width page-gutter py-6 md:py-8">
      <Link
        to="/suppliers"
        className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-ink-70 hover:text-ink"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        All suppliers
      </Link>

      <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_320px] md:gap-10">
        <div className="min-w-0">
          <div className="overflow-hidden rounded-card border border-line">
            <SupplierImage supplier={supplier} ratio="aspect-[16/9]" />
          </div>

          <h1 className="font-display mt-6 text-2xl font-bold text-ink md:text-3xl">
            {supplier.name}
          </h1>
          <p className="mt-1.5 text-base text-ink-40">
            {supplier.location} · {supplier.faculty} · Level {supplier.level} · {supplier.type}
          </p>
          <CategoryPills categories={supplier.categories} className="mt-3" />

          <p className="mt-3 flex flex-wrap items-center gap-x-1.5 text-sm">
            <span
              className={
                'inline-block h-2 w-2 shrink-0 rounded-pill ' +
                (supplier.isOpen ? 'bg-blue' : 'border border-ink-40')
              }
              aria-hidden="true"
            />
            <span className={supplier.isOpen ? 'text-ink-70' : 'text-ink-40'}>
              {supplier.isOpen ? 'Open now' : 'Closed'}
            </span>
          </p>

          <p className="mt-4 max-w-prose text-base text-ink-70">{supplier.desc}</p>

          <h2 className="mt-6 text-base font-semibold text-ink">Opening hours</h2>
          <dl className="mt-2 max-w-xs divide-y divide-line rounded-card border border-line text-sm">
            {supplier.openingHours.map((h) => (
              <div key={h.day} className="flex justify-between px-3 py-2">
                <dt className="text-ink-70">{h.day === 8 ? 'Every day' : DAY_NAMES[h.day - 1]}</dt>
                <dd className="tnum text-ink">
                  {h.day === 8 ? 'Open 24 hours' : h.open + '–' + h.close}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Desktop: the action sits alongside. Mobile: it follows the header. */}
        <aside className="md:pt-2">
          <div className="card p-4">
            <p className="text-sm text-ink-70">
              Tell your courier what you want in your own words — there is no menu to pick from.
            </p>
            <Button size="lg" className="mt-4 w-full" onClick={requestFromHere}>
              Request from here
            </Button>
          </div>
        </aside>
      </div>

      {siblings.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-semibold text-ink">Also at {supplier.location}</h2>
          <p className="mt-1 text-sm text-ink-40">
            Other suppliers at the same location.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {siblings.map((stall) => (
              <SupplierCard key={stall.id} supplier={stall} />
            ))}
          </div>
        </section>
      )}

    </div>
  )
}
