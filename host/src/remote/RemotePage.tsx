import {
  Component,
  lazy,
  Suspense,
  type CSSProperties,
  type LazyExoticComponent,
  type ReactNode,
} from 'react'
import type { RemotePropsByService, RemoteServiceId } from '@relay/contracts'
import { GlassCard, LoadingState, RelayCardAnchor, type BubbleAnchor } from '@relay/ui'
import { loadServiceRemote, type RemoteComponents } from './RemoteLoader'

type PresentationProps = {
  serviceLabel: string
  visible: boolean
  overlay?: boolean
  overlayClassName?: string
  card?: boolean
  cardStyle?: CSSProperties
  bubbleAnchor?: BubbleAnchor
}

export type RemotePageProps = {
  [K in RemoteServiceId]: PresentationProps & { service: K; appProps: RemotePropsByService[K] }
}[RemoteServiceId]

const remoteApps: { [K in RemoteServiceId]: LazyExoticComponent<RemoteComponents[K]> } = {
  credit: lazy(() => loadServiceRemote('credit')),
  user: lazy(() => loadServiceRemote('user')),
  supplier: lazy(() => loadServiceRemote('supplier')),
  errand: lazy(() => loadServiceRemote('errand')),
}

// Narrow the discriminated union before rendering; no props assertion is needed.
function RemoteContent(props: RemotePageProps) {
  switch (props.service) {
    case 'credit':
      return <remoteApps.credit {...props.appProps} />
    case 'user':
      return <remoteApps.user {...props.appProps} />
    case 'supplier':
      return <remoteApps.supplier {...props.appProps} />
    case 'errand':
      return <remoteApps.errand {...props.appProps} />
  }
}

// Catch rendering errors and show error state
class RemoteFailureBoundary extends Component<
  { children: ReactNode; serviceLabel: string },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <section className="remote-state" role="alert">
          <h2>{this.props.serviceLabel} is unavailable</h2>
          <p>If this is unexpected, please report it to the developers.</p>
        </section>
      )
    }

    return this.props.children
  }
}

export function RemotePage(props: RemotePageProps) {
  const {
    service,
    serviceLabel,
    visible,
    overlay,
    overlayClassName,
    card,
    cardStyle,
    bubbleAnchor,
  } = props

  return (
    <section
      className={`remote-page${overlay ? ' remote-page-overlay' : ''}${overlayClassName ? ` ${overlayClassName}` : ''}`}
      aria-label={serviceLabel}
      style={{ display: visible ? undefined : 'none' }}
    >
      <RemoteFailureBoundary key={service} serviceLabel={serviceLabel}>
        {card && bubbleAnchor ? (
          <RelayCardAnchor
            placement="anchored"
            anchor={bubbleAnchor}
            className={`${service === 'credit' ? 'remote-credit-anchor' : 'remote-profile-anchor'} relay-mobile-bottom-sheet-anchor`}
            style={cardStyle}
          >
            <GlassCard
              variant="glass"
              className={`remote-profile-card relay-mobile-sheet-surface${props.service === 'credit' && props.appProps.creditHistoryOpen ? ' remote-credit-history-card' : ''}`}
            >
              <Suspense fallback={<LoadingState label={`Loading ${serviceLabel}`} />}>
                <RemoteContent {...props} />
              </Suspense>
            </GlassCard>
          </RelayCardAnchor>
        ) : (
          <GlassCard variant="plain">
            <Suspense fallback={<LoadingState label={`Loading ${serviceLabel}`} />}>
              <RemoteContent {...props} />
            </Suspense>
          </GlassCard>
        )}
      </RemoteFailureBoundary>
    </section>
  )
}
