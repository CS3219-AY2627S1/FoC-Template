/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Created as the requester half of the former Activity.jsx (deleted), per
 *        instructions.md Stage 22's "My activity" row ("My errands at /my-errands (requester
 *        only)"). Shares data loading and ActivityCard with MyDeliveries.jsx via
 *        activityShared.jsx.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 g (instructions.md) - added the "Scheduled" section above "Active now".
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import EmptyState from '../components/EmptyState'
import ScheduledSeriesSection from '../components/ScheduledSeriesSection'
import { ActivitySection, useActivityList } from './activityShared'

// Order F3.4.2 active requests, F5 cancellation, F6 editing, F1.4.1 / F4.1.3 credit outcomes.
export default function MyErrands() {
  const { active, history, notice, locationName, runAction } = useActivityList('errands')
  const empty = active.length === 0 && history.length === 0

  return (
    <div className="page-width page-gutter py-8 md:py-10">
      <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">My errands</h1>

      <ScheduledSeriesSection />

      {notice}

      {!notice && (
        <ActivitySection
          heading="Active now"
          items={active}
          asCourier={false}
          locationName={locationName}
          runAction={runAction}
        />
      )}
      {!notice && (
        <ActivitySection
          heading="History"
          items={history}
          asCourier={false}
          locationName={locationName}
          runAction={runAction}
        />
      )}

      {!notice && empty && (
        <div className="mt-6">
          <EmptyState
            title="No errands yet"
            body="Errands you post will show up here with their progress."
          />
        </div>
      )}
    </div>
  )
}
