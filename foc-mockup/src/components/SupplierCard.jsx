/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component SupplierCard.jsx from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Switched the card to the API-contract fields (faculty, categories pills, isOpen only);
 *        removed hours and activeRequests, which the list response does not carry. No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bookmark } from 'lucide-react'
import SupplierImage from './SupplierImage'
import CategoryPills from './CategoryPills'
import Button from './Button'
import { qualifiedName } from '../data/suppliers'
import { useDemo } from '../context/DemoContext'

// Supplier F1.1 listing, F1.2.1 open/closed indicator, plus the bookmarking nice-to-have.
// showLocation: false inside a location group (the heading already names it), true everywhere else.
export default function SupplierCard({
  supplier,
  ratio = 'aspect-[4/3]',
  showAction = true,
  showLocation = false,
}) {
  const { requireLogin } = useDemo()
  const navigate = useNavigate()
  const [bookmarked, setBookmarked] = useState(supplier.id === 1 || supplier.id === 5)

  const requestFromHere = () =>
    requireLogin('You need an account to post an errand.', () =>
      navigate('/requests/new?supplier=' + supplier.id),
    )

  return (
    <article className="card flex flex-col overflow-hidden">
      <div className="relative">
        <Link to={'/suppliers/' + supplier.id} aria-label={'View ' + supplier.name}>
          <SupplierImage supplier={supplier} ratio={ratio} />
        </Link>
        <button
          type="button"
          onClick={() => setBookmarked((v) => !v)}
          aria-pressed={bookmarked}
          aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this place'}
          className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-pill"
        >
          <Bookmark
            size={20}
            aria-hidden="true"
            className={bookmarked ? 'fill-ink text-ink' : 'text-white'}
            strokeWidth={bookmarked ? 1.5 : 2}
            style={bookmarked ? undefined : { filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.5))' }}
          />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="text-base font-semibold text-ink">
          <Link
            to={'/suppliers/' + supplier.id}
            className="inline-flex min-h-[44px] min-w-[44px] items-center hover:underline md:min-h-0 md:min-w-0"
          >
            {showLocation ? qualifiedName(supplier) : supplier.name}
          </Link>
        </h3>
        <p className="text-sm text-ink-40">{supplier.faculty}</p>
        <CategoryPills categories={supplier.categories} className="mt-1" />

        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm">
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

        {showAction && (
          <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={requestFromHere}>
            Request from here
          </Button>
        )}
      </div>
    </article>
  )
}
