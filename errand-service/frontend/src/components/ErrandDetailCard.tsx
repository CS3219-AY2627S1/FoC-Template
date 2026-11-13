// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-13
// Scope: Generated initial implementation, decomposed App.tsx into separate components
// Author review: I validated correctness and edited for style.

import { useState } from 'react'
import { ErrorMessage, GlassCard, IconButton, RelayButton, StatusBadge } from '@relay/ui'
import type { Errand } from '@relay/contracts'
import {
  formatDeadline,
  formatRoute,
  SERVICE_TYPE_LABELS,
  STATUS_LABELS,
  statusTone,
} from '../types'

function Avatar({ name, image }: { name?: string; image?: string }) {
  if (image) return <img className="errand-avatar" src={image} alt="" />
  return <span className="errand-avatar errand-avatar-placeholder">{name?.[0] ?? '?'}</span>
}

export function ErrandDetailCard({
  errand,
  role,
  onClose,
  onAction,
}: {
  errand: Errand
  role: 'requester' | 'courier'
  onClose: () => void
  onAction: (
    action: 'accept' | 'pickup' | 'deliver' | 'confirm' | 'cancel' | 'drop' | 'delete',
  ) => void | Promise<void>
}) {
  const [errorMessage, setErrorMessage] = useState('')
  const action = async (value: Parameters<typeof onAction>[0]) => {
    setErrorMessage('')
    try {
      await onAction(value)
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update the errand.')
    }
  }

  const canAccept = role === 'courier' && errand.status === 'OPEN'
  const canPickup = role === 'courier' && errand.status === 'ACCEPTED'
  const canDeliver = role === 'courier' && errand.status === 'PICKED_UP'
  const canConfirm = role === 'requester' && errand.status === 'DELIVERED'
  const canCancel = role === 'requester' && errand.status === 'OPEN'
  const canDrop = role === 'courier' && errand.status === 'ACCEPTED'
  const canDelete =
    role === 'requester' && ['CANCELLED', 'EXPIRED', 'CONFIRMED', 'DELETED'].includes(errand.status)

  return (
    <GlassCard
      className="errand-detail-card relay-mobile-sheet-surface relay-card-scroll-surface"
      aria-label={`${errand.name} details`}
    >
      <div className="errand-detail-header">
        <div className="errand-detail-back-row">
          <IconButton label="Close errand details" onClick={onClose}>
            ×
          </IconButton>
        </div>
        <div className="errand-detail-heading">
          <p>{role === 'courier' ? 'AVAILABLE ERRAND' : 'ACTIVE ERRAND'}</p>
          <h2>{errand.name}</h2>
          <div className="errand-detail-meta">
            <StatusBadge tone={statusTone(errand.status)}>
              {STATUS_LABELS[errand.status]}
            </StatusBadge>
            <span>Starts {formatDeadline(errand.startAt)}</span>
            <span>Due {formatDeadline(errand.expiresAt)}</span>
          </div>
        </div>
      </div>

      {errand.courierSub && (
        <div className="errand-person-card">
          <Avatar
            name={errand.courierProfile?.username ?? errand.courierSub.substring(0, 8)}
            image={errand.courierProfile?.profilePictureUrl ?? undefined}
          />
          <div>
            <strong>Courier</strong>
            <span>
              {errand.courierProfile?.username ??
                (role === 'requester' ? 'Assigned to your errand' : 'Courier · NUS verified')}
            </span>
          </div>
          <span className="errand-online-dot" aria-label="Online" />
        </div>
      )}

      <div className="errand-route-card">
        <div>
          <span className="route-label">PICKUP</span>
          <strong>{formatRoute(errand.pickupLocation)}</strong>
        </div>
        <div>
          <span className="route-label">DELIVERY</span>
          <strong>{formatRoute(errand.targetLocation)}</strong>
        </div>
      </div>

      <div className="errand-info-card">
        <span className="route-label">
          {SERVICE_TYPE_LABELS[
            errand.supplierDetails.serviceType as keyof typeof SERVICE_TYPE_LABELS
          ]?.toUpperCase()}{' '}
          · INSTRUCTIONS
        </span>
        <p>{errand.deliveryDetails.description}</p>
        <small>{errand.deliveryDetails.instructions}</small>
      </div>

      <div className="errand-reward-card">
        <div>
          <span className="route-label">REWARD</span>
          <strong>{errand.creditAmount} credits</strong>
        </div>
        <small>
          {role === 'courier'
            ? 'Transferred after requester confirms delivery'
            : 'Reserved until delivery is confirmed'}
        </small>
      </div>

      {errand.status === 'ACCEPTED' || errand.status === 'PICKED_UP' ? (
        <div className="errand-progress" aria-label="Errand progress">
          {['Accepted', 'Collected', 'Delivered', 'Confirmed'].map((step, index) => {
            const current = ['ACCEPTED', 'PICKED_UP', 'DELIVERED', 'CONFIRMED'].indexOf(
              errand.status,
            )
            return (
              <div className={index <= current ? 'active' : ''} key={step}>
                <span>{index + 1}</span>
                <small>{step}</small>
              </div>
            )
          })}
        </div>
      ) : null}

      {errorMessage && <ErrorMessage message={errorMessage} />}

      <div className="errand-action-stack">
        {canAccept && (
          <RelayButton variant="primary" onClick={() => action('accept')}>
            Accept errand
          </RelayButton>
        )}
        {canPickup && (
          <RelayButton variant="primary" onClick={() => action('pickup')}>
            ✓ Mark as collected
          </RelayButton>
        )}
        {canDeliver && (
          <RelayButton variant="primary" onClick={() => action('deliver')}>
            Mark as delivered
          </RelayButton>
        )}
        {canConfirm && (
          <RelayButton variant="primary" onClick={() => action('confirm')}>
            Confirm delivery — transfer {errand.creditAmount} cr
          </RelayButton>
        )}
        {canCancel && (
          <RelayButton variant="danger" onClick={() => void action('cancel')}>
            Cancel errand
          </RelayButton>
        )}
        {canDrop && (
          <RelayButton variant="danger" onClick={() => void action('drop')}>
            Drop errand
          </RelayButton>
        )}
        {canDelete && (
          <RelayButton variant="plain" onClick={() => action('delete')}>
            Delete request
          </RelayButton>
        )}
      </div>
    </GlassCard>
  )
}
