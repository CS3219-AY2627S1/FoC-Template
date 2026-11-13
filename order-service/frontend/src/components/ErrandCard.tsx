import {
  ArrowRight,
  BriefcaseBusiness,
  Clock3,
  MapPinned,
  RotateCcw,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Order } from '../api/orderApi'
import {
  credits,
  REPOSTABLE_STATES,
  repostPath,
  stateLabel,
} from '../utils/orderFormatting'
import { RouteLine } from './RouteLine'
import { StateBadge } from './StateBadge'

interface ErrandCardProps {
  canRepost?: boolean
  layout?: 'card' | 'history'
  order: Order
  showPendingReward?: boolean
  timingLabel: string
}

/** One real-data card language for Courier discovery and both roles' errand history. */
export function ErrandCard({
  canRepost = false,
  layout = 'card',
  order,
  showPendingReward = false,
  timingLabel,
}: ErrandCardProps) {
  return (
    <li
      className={`card errand-card${layout === 'history' ? ' errand-card-history' : ''}${order.reviewCaseId && !order.reviewResolved ? ' errand-under-review' : ''}`}
    >
      <div aria-hidden="true" className="errand-card-visual">
        <span className="errand-card-visual-icon">
          {layout === 'history' && !canRepost ? (
            <BriefcaseBusiness />
          ) : (
            <MapPinned />
          )}
        </span>
      </div>
      <div className="errand-card-content">
        <div className="errand-card-head">
          {order.reviewCaseId ? (
            <span className="review-badge">
              {order.reviewResolved ? 'Resolved after review' : 'Under review'}
            </span>
          ) : (
            <StateBadge
              state={order.state}
              terminalReason={order.terminalReason}
            />
          )}
          <span
            aria-label={`${credits(order.creditReward)} reward`}
            className={`reward${layout === 'history' && !canRepost ? ' reward-earned' : ''}`}
          >
            <strong>
              {layout === 'history' && !canRepost ? '+' : ''}
              {order.creditReward}
            </strong>
            <small>
              {layout === 'history'
                ? canRepost
                  ? 'Reward'
                  : 'Earned'
                : 'credits'}
            </small>
          </span>
        </div>
        <h3>{order.title}</h3>
        {order.reviewCaseId && !order.reviewResolved && (
          <p className="subtle">
            Paused at: {stateLabel(order.state)} · Errand actions are paused
            during review.
          </p>
        )}
        <div className="errand-card-meta">
          <RouteLine order={order} />
          <p className="errand-timing">
            <Clock3 aria-hidden="true" />
            <span>{timingLabel}</span>
          </p>
        </div>
        {showPendingReward && order.pendingCreditReward !== null && (
          <p className="notice notice-next errand-card-notice">
            Reward change to {credits(order.pendingCreditReward)} pending
          </p>
        )}
        <div className="errand-card-foot">
          <div className="errand-card-links">
            {canRepost &&
              (!order.reviewCaseId || order.reviewResolved) &&
              REPOSTABLE_STATES.includes(order.state) && (
                <Link
                  aria-label={`Post ${order.title} again`}
                  className="text-link"
                  to={repostPath(order.id)}
                >
                  <RotateCcw aria-hidden="true" /> Post again
                </Link>
              )}
            <Link
              aria-label={`View ${order.title}`}
              className="text-link errand-view-link"
              to={`/errands/${order.id}`}
            >
              View details <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </li>
  )
}
