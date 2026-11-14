/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: Created the "Not authorised" view rendered in place by RequireRole, per
 *        instructions.md Stage 16b.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { Link } from 'react-router-dom'
import EmptyState from './EmptyState'
import Button from './Button'

export default function Forbidden() {
  return (
    <div className="page-width page-gutter py-10">
      <EmptyState
        title="Not authorised"
        body="You don't have access to this page."
        action={
          <Button as={Link} to="/" size="sm">
            Go home
          </Button>
        }
      />
    </div>
  )
}
