import { useLayoutEffect, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, ReactNode } from 'react'
import type { Errand } from '@relay/contracts'
import relayHandoffLogo from './assets/relay-handoff.png'

export type BubbleAnchor = {
  top: number
  left: number
  right: number
  bottom: number
}

type CardViewportBounds = {
  top: number
  right: number
  bottom: number
  left: number
}

function getDesktopCardViewportBounds(
  surface: HTMLElement,
  margin: number,
  gap: number,
): CardViewportBounds {
  const bounds: CardViewportBounds = {
    top: margin,
    right: window.innerWidth - margin,
    bottom: window.innerHeight - margin,
    left: margin,
  }

  for (const element of surface.querySelectorAll<HTMLElement>('[data-relay-card-exclusion]')) {
    const rect = element.getBoundingClientRect()
    if (!rect.width || !rect.height) continue

    for (const edge of element.dataset.relayCardExclusion?.split(' ') ?? []) {
      if (edge === 'top') bounds.top = Math.max(bounds.top, rect.bottom + gap)
      if (edge === 'right') bounds.right = Math.min(bounds.right, rect.left - gap)
      if (edge === 'bottom') bounds.bottom = Math.min(bounds.bottom, rect.top - gap)
      if (edge === 'left') bounds.left = Math.max(bounds.left, rect.right + gap)
    }
  }

  return bounds
}

export type RelayButtonVariant = 'primary' | 'secondary' | 'danger' | 'plain'
export type RelayButtonSize = 'default' | 'map-pill' | 'map-icon' | 'map-action'

export function RelayButton({
  variant = 'secondary',
  scale = 1,
  size = 'default',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: RelayButtonVariant
  scale?: number
  size?: RelayButtonSize
  children: ReactNode
}) {
  return (
    <button
      {...props}
      style={{ ...props.style, '--relay-button-scale': scale } as CSSProperties}
      className={`relay-button relay-button-${variant}${size !== 'default' ? ` relay-button-size-${size}` : ''}${className ? ` ${className}` : ''}`}
    >
      {children}
    </button>
  )
}

export function ButtonWithImage({
  imageUrl,
  imageAlt = '',
  fallback,
  variant = 'secondary',
  size = 'default',
  scale = 1,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  imageUrl?: string | null
  imageAlt?: string
  fallback: ReactNode
  children: ReactNode
  variant?: RelayButtonVariant
  size?: RelayButtonSize
  scale?: number
}) {
  const [imageFailed, setImageFailed] = useState(false)

  return (
    <RelayButton
      {...props}
      variant={variant}
      size={size}
      scale={scale}
      className={`relay-button-with-image${className ? ` ${className}` : ''}`}
    >
      <span className="relay-button-with-image-avatar" aria-hidden={imageAlt ? undefined : 'true'}>
        {imageUrl && !imageFailed ? (
          <img src={imageUrl} alt={imageAlt} onError={() => setImageFailed(true)} />
        ) : (
          fallback
        )}
      </span>
      {children}
    </RelayButton>
  )
}

export function TextButton({
  className = '',
  children,
  withBounce = true,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; withBounce?: boolean }) {
  return (
    <button
      {...props}
      type={props.type ?? 'button'}
      className={`relay-text-button${withBounce ? ' relay-text-button-bouncy' : ''}${className ? ` ${className}` : ''}`}
    >
      {children}
    </button>
  )
}

export function Spacer({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`relay-spacer${className ? ` ${className}` : ''}`} />
}

export function BubblePopover({
  anchor,
  children,
  className = '',
  open = true,
  maxWidth = 360,
  placement = 'auto',
}: {
  anchor?: BubbleAnchor
  children: ReactNode
  className?: string
  open?: boolean
  maxWidth?: number
  placement?: 'auto' | 'above'
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  useLayoutEffect(() => {
    setReady(false)
    const popoverFrame = frameRef.current
    if (!open || !anchor || !popoverFrame) return
    const cardSurface =
      popoverFrame.closest<HTMLElement>('.supplier-app, .errand-map-shell') ?? document.body

    let animationFrame: number | undefined
    const schedulePosition = () => {
      if (animationFrame !== undefined) window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = undefined
        const isMobile = window.innerWidth <= 700
        if (isMobile) {
          popoverFrame.style.top = 'auto'
          popoverFrame.style.right = '0'
          popoverFrame.style.bottom = '0'
          popoverFrame.style.left = '0'
          popoverFrame.style.width = '100%'
          popoverFrame.style.maxWidth = '100vw'
          popoverFrame.style.maxHeight = 'calc(100dvh - 24px)'
          popoverFrame.style.paddingBottom = 'calc(72px + env(safe-area-inset-bottom))'
          setReady(true)
          return
        }

        const gap = 16
        const bounds = getDesktopCardViewportBounds(cardSurface, 24, gap)
        const availableWidth = Math.max(0, bounds.right - bounds.left)
        const maxHeight = Math.max(0, bounds.bottom - bounds.top)
        const width = Math.min(maxWidth, availableWidth)
        popoverFrame.style.width = `${width}px`
        popoverFrame.style.maxWidth = `${width}px`
        popoverFrame.style.maxHeight = `${maxHeight}px`
        popoverFrame.style.right = 'auto'
        popoverFrame.style.bottom = 'auto'
        popoverFrame.style.paddingBottom = '0'

        // Use layout dimensions so the opening scale animation cannot make the
        // card appear small enough to fit on a side where it will later overflow.
        const measuredWidth = popoverFrame.offsetWidth
        const measuredHeight = popoverFrame.offsetHeight
        const centeredLeft = (anchor.left + anchor.right - measuredWidth) / 2
        const left =
          placement === 'above'
            ? Math.min(
                Math.max(bounds.left, centeredLeft),
                Math.max(bounds.left, bounds.right - measuredWidth),
              )
            : (() => {
                const canPlaceRight = anchor.right + gap + measuredWidth <= bounds.right
                const canPlaceLeft = anchor.left - gap - measuredWidth >= bounds.left
                const preferredLeft = canPlaceRight
                  ? anchor.right + gap
                  : canPlaceLeft
                    ? anchor.left - gap - measuredWidth
                    : centeredLeft
                return Math.min(
                  Math.max(bounds.left, preferredLeft),
                  Math.max(bounds.left, bounds.right - measuredWidth),
                )
              })()
        const preferredTop =
          placement === 'above'
            ? anchor.top - gap - measuredHeight
            : (anchor.top + anchor.bottom - measuredHeight) / 2
        const top = Math.min(
          Math.max(bounds.top, preferredTop),
          Math.max(bounds.top, bounds.bottom - measuredHeight),
        )
        popoverFrame.style.left = `${left}px`
        popoverFrame.style.top = `${top}px`
        const anchorX = (anchor.left + anchor.right) / 2
        const anchorY = (anchor.top + anchor.bottom) / 2
        popoverFrame.style.setProperty('--relay-bubble-origin-x', `${anchorX - left}px`)
        popoverFrame.style.setProperty('--relay-bubble-origin-y', `${anchorY - top}px`)
        setReady(true)
      })
    }

    const observer = new ResizeObserver(schedulePosition)
    observer.observe(popoverFrame)
    for (const child of popoverFrame.children) observer.observe(child)
    for (const exclusion of cardSurface.querySelectorAll<HTMLElement>(
      '[data-relay-card-exclusion]',
    ))
      observer.observe(exclusion)
    const mutations = new MutationObserver(schedulePosition)
    mutations.observe(popoverFrame, { childList: true, subtree: true, characterData: true })
    window.addEventListener('resize', schedulePosition)
    schedulePosition()
    return () => {
      observer.disconnect()
      mutations.disconnect()
      window.removeEventListener('resize', schedulePosition)
      if (animationFrame !== undefined) window.cancelAnimationFrame(animationFrame)
    }
  }, [anchor, maxWidth, open, placement])

  if (!open || !anchor) return <>{children}</>

  return (
    <div
      className={`relay-bubble-popover${ready ? ' relay-bubble-popover-ready' : ' relay-bubble-popover-measuring'}${className ? ` ${className}` : ''}`}
    >
      <div ref={frameRef} className="relay-bubble-popover-frame">
        {children}
      </div>
    </div>
  )
}

export function IconButton({
  label,
  scale = 1,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  scale?: number
  children: ReactNode
}) {
  return (
    <button
      {...props}
      type={props.type ?? 'button'}
      style={{ ...props.style, '--relay-icon-button-scale': scale } as CSSProperties}
      className={`relay-icon-button${className ? ` ${className}` : ''}`}
      title={label}
      aria-label={label}
    >
      {children}
    </button>
  )
}

export function BackButton({
  label = 'Go back',
  className = '',
  scale = 1,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label?: string
  scale?: number
}) {
  return (
    <IconButton label={label} scale={scale} className={className} {...props}>
      <svg
        viewBox="0 0 24 24"
        height="16px"
        width="16px"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M7.83,13l5.6,5.6L12,20L4,12l8-8l1.43,1.4L7.83,11H20v2H7.83Z" />
      </svg>
    </IconButton>
  )
}

export function CloseButton({
  label = 'Close',
  className = '',
  scale = 1,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label?: string
  scale?: number
}) {
  return (
    <IconButton label={label} scale={scale} className={className} {...props}>
      <svg
        viewBox="0 0 24 24"
        height="16px"
        width="16px"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M6.4,19L5,17.6L10.6,12L5,6.4L6.4,5L12,10.6L17.6,5L19,6.4L13.4,12L19,17.6L17.6,19L12,13.4L6.4,19Z" />
      </svg>
    </IconButton>
  )
}

export function FilterIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M32 48H480L304 272V432L208 480V272L32 48Z"
        stroke="currentColor"
        strokeWidth="44"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function LocationIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 192 192"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M32 76L156 18C166 13 176 23 171 33L113 157C108 168 92 165 92 153V101H32C20 101 14 84 32 76Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function BoltIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M13.2 2 5 13h5.7L9.8 22 19 10.5h-5.8L13.2 2Z" fill="currentColor" />
    </svg>
  )
}

export function BellIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M6.5 10a5.5 5.5 0 0 1 11 0c0 6 2.5 6.5 2.5 8H4c0-1.5 2.5-2 2.5-8ZM10 21h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ClipboardPlusIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M9 4h6m-5 0a2 2 0 0 1 4 0m-6 0H6.5A1.5 1.5 0 0 0 5 5.5v14A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V13"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M15 17h6m-3-3v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function StorePlusIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4 10v10h11M4 10l2-5h12l2 5M4 10c0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2-2 0 1.1.9 2 2 2s2-.9 2-2M8 20v-5h4v5m7-5v6m-3-3h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function PencilIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="m4 16.5-.7 3.7 3.7-.7L18.8 7.7a2.1 2.1 0 0 0-3-3L4 16.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="m14.5 6.5 3 3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

export function PlusIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function ClockIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 6V12L16 14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function StatusBadge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'success' | 'danger' | 'warning'
}) {
  return <span className={`relay-status-badge relay-status-${tone}`}>{children}</span>
}

const updateStatusLabels: Record<Errand['status'], string> = {
  OPEN: 'Open',
  ACCEPTED: 'Accepted',
  PICKED_UP: 'Collected',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  CONFIRMED: 'Confirmed',
  DELETED: 'Deleted',
}

function updateStatusTone(status: Errand['status']): 'neutral' | 'success' | 'danger' | 'warning' {
  if (status === 'OPEN' || status === 'DELIVERED' || status === 'CONFIRMED') return 'success'
  if (status === 'CANCELLED' || status === 'EXPIRED' || status === 'DELETED') return 'danger'
  if (status === 'ACCEPTED' || status === 'PICKED_UP') return 'warning'
  return 'neutral'
}

function updateDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  )
}

export function UpdatesCard({
  errands,
  loading = false,
  error,
  onClose,
  onSelect,
}: {
  errands: Errand[]
  loading?: boolean
  error?: string
  onClose: () => void
  onSelect?: (errand: Errand) => void
}) {
  return (
    <GlassCard className="relay-updates-card relay-mobile-sheet-surface" aria-label="Updates">
      <div className="relay-updates-header">
        <div>
          <p className="relay-updates-eyebrow">REQUESTS</p>
          <h2>Updates</h2>
        </div>
        <CloseButton label="Close updates" onClick={onClose} />
      </div>
      {loading && <LoadingState label="Loading updates" />}
      {!loading && error && <p className="relay-updates-message">{error}</p>}
      {!loading && !error && errands.length === 0 && (
        <p className="relay-updates-message">You have no requests yet.</p>
      )}
      {!loading && !error && errands.length > 0 && (
        <div className="relay-updates-list">
          {errands.map((errand) => {
            const content = (
              <>
                <span className="relay-updates-item-heading">
                  <strong>{errand.name}</strong>
                  <StatusBadge tone={updateStatusTone(errand.status)}>
                    {updateStatusLabels[errand.status]}
                  </StatusBadge>
                </span>
                <small>
                  Starts {updateDate(errand.startAt)} · Due {updateDate(errand.expiresAt)}
                </small>
              </>
            )
            return onSelect ? (
              <button
                className="relay-updates-item"
                type="button"
                key={errand.id}
                onClick={() => onSelect(errand)}
              >
                {content}
              </button>
            ) : (
              <div className="relay-updates-item" key={errand.id}>
                {content}
              </div>
            )
          })}
        </div>
      )}
    </GlassCard>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <span className="relay-spinner" role="status" aria-label={label} />
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="relay-loading-state" role="status" aria-label={label}>
      <Spinner label={label} />
    </div>
  )
}

export function RelayBrand({ className = '' }: { className?: string }) {
  return (
    <div className={`relay-brand${className ? ` ${className}` : ''}`}>
      <span className="relay-brand-icon" aria-hidden="true">
        <img className="relay-brand-icon-art" src={relayHandoffLogo} alt="" />
      </span>
      <span>Relay</span>
    </div>
  )
}

export function CardView({
  as = 'section',
  children,
  className = '',
  withGlow = false,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'aside' | 'section'
  children: ReactNode
  withGlow?: boolean
}) {
  const Element = as
  return (
    <Element
      {...props}
      className={`relay-card-view relay-glass-surface glass-card${withGlow ? ' relay-card-view-with-glow' : ''}${className ? ` ${className}` : ''}`}
    >
      {children}
    </Element>
  )
}

export function GlassWindow({
  children,
  background,
  className = '',
  withGlow = false,
}: {
  children: ReactNode
  background?: ReactNode
  className?: string
  withGlow?: boolean
}) {
  return (
    <div className={`relay-glass-window${className ? ` ${className}` : ''}`}>
      {background && <div className="relay-glass-window-background">{background}</div>}
      <CardView as="section" className="relay-glass-window-panel" withGlow={withGlow}>
        {children}
      </CardView>
    </div>
  )
}

export function GlassCard({
  as = 'div',
  children,
  className = '',
  variant = 'glass',
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'aside' | 'section'
  children: ReactNode
  variant?: 'glass' | 'plain'
}) {
  const Element = as
  return (
    <Element
      {...props}
      className={`${variant === 'glass' ? 'relay-glass-card relay-glass-surface glass-card' : ''}${className ? ` ${className}` : ''}`.trim()}
    >
      {children}
    </Element>
  )
}

export function RelayFormOverlay({
  children,
  className = '',
  open = true,
  onClose,
}: {
  children: ReactNode
  className?: string
  open?: boolean
  onClose?: () => void
}) {
  if (!open) return null
  return (
    <div
      className={`relay-form-overlay${className ? ` ${className}` : ''}`}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.()
      }}
    >
      {children}
    </div>
  )
}

export type RelayCardPlacement =
  'top-left' | 'top-right' | 'center-right' | 'bottom-left' | 'bottom-right' | 'anchored'
export type RelayCardSize = 'small' | 'medium' | 'large'

const relayCardWidths: Record<RelayCardSize, number> = {
  small: 405,
  medium: 540,
  large: 680,
}

export function RelayCardAnchor({
  children,
  placement = 'center-right',
  size = 'medium',
  anchor,
  preferredSide = 'bottom-end',
  offset = 12,
  viewportPadding = 16,
  className = '',
  style,
}: {
  children: ReactNode
  placement?: RelayCardPlacement
  size?: RelayCardSize
  anchor?: BubbleAnchor
  preferredSide?: 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end'
  offset?: number
  viewportPadding?: number
  className?: string
  style?: CSSProperties
}) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const [measuredHeight, setMeasuredHeight] = useState<number>()
  const [viewport, setViewport] = useState<{ width: number; height: number }>()
  const anchoredStyle: CSSProperties = {}
  const cardWidth = relayCardWidths[size]
  const viewportWidth = viewport?.width ?? (typeof window !== 'undefined' ? window.innerWidth : 0)
  const viewportHeight =
    viewport?.height ?? (typeof window !== 'undefined' ? window.innerHeight : 0)
  if (placement === 'anchored' && anchor && viewportWidth > 0 && viewportHeight > 0) {
    const availableWidth = Math.max(0, viewportWidth - viewportPadding * 2)
    const anchoredCardWidth = Math.min(cardWidth, availableWidth)
    const left = preferredSide.endsWith('end')
      ? Math.min(
          Math.max(viewportPadding, anchor.right - anchoredCardWidth),
          viewportWidth - anchoredCardWidth - viewportPadding,
        )
      : Math.min(
          Math.max(viewportPadding, anchor.left),
          viewportWidth - anchoredCardWidth - viewportPadding,
        )
    const estimatedHeight = Math.min(viewportHeight * 0.6, viewportHeight - viewportPadding * 2)
    const cardHeight = measuredHeight ?? estimatedHeight
    const belowTop = anchor.bottom + offset
    const top = preferredSide.startsWith('top')
      ? Math.max(viewportPadding, anchor.top - cardHeight - offset)
      : belowTop + cardHeight <= viewportHeight - viewportPadding
        ? belowTop
        : Math.max(viewportPadding, anchor.top - cardHeight - offset)
    Object.assign(anchoredStyle, {
      top,
      left,
      width: anchoredCardWidth,
      maxHeight: Math.max(0, viewportHeight - viewportPadding * 2),
    })
  }
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return
    const updateViewport = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    updateViewport()
    window.addEventListener('resize', updateViewport)
    return () => window.removeEventListener('resize', updateViewport)
  }, [])
  useLayoutEffect(() => {
    if (placement !== 'anchored' || !anchor || typeof window === 'undefined') {
      setMeasuredHeight(undefined)
      return
    }
    let frame: number | undefined
    const measure = () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        frame = undefined
        const height = anchorRef.current?.getBoundingClientRect().height
        if (height && height !== measuredHeight) setMeasuredHeight(height)
      })
    }
    const observer = new ResizeObserver(measure)
    if (anchorRef.current) observer.observe(anchorRef.current)
    window.addEventListener('resize', measure)
    measure()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      if (frame !== undefined) window.cancelAnimationFrame(frame)
    }
  }, [anchor, measuredHeight, placement, preferredSide, viewportPadding, viewport])
  return (
    <div
      ref={anchorRef}
      className={`relay-card-anchor relay-card-placement-${placement} relay-card-size-${size}${className ? ` ${className}` : ''}`}
      style={{ ...anchoredStyle, ...style }}
    >
      {children}
    </div>
  )
}

export function RelayFormSurface({
  children,
  title,
  description,
  footer,
  onClose,
  className = '',
  headerVariant = 'default',
  as = 'section',
  style,
}: {
  children: ReactNode
  title: ReactNode
  description?: ReactNode
  footer?: ReactNode
  onClose?: () => void
  className?: string
  headerVariant?: 'default' | 'card'
  as?: 'div' | 'section' | 'aside'
  style?: CSSProperties
}) {
  const Element = as
  return (
    <Element
      style={style}
      className={`relay-form-surface relay-glass-surface glass-card${className ? ` ${className}` : ''}`}
    >
      <header
        className={`relay-form-surface-header${headerVariant === 'card' ? ' relay-card-header' : ''}`}
      >
        <div>
          <h2>{title}</h2>
          {description && headerVariant === 'default' && <p>{description}</p>}
        </div>
        {onClose && <CloseButton onClick={onClose} />}
      </header>
      {description && headerVariant === 'card' && (
        <p className="relay-card-description">{description}</p>
      )}
      <div className="relay-form-surface-body">{children}</div>
      {footer && <footer className="relay-form-surface-footer">{footer}</footer>}
    </Element>
  )
}

export function RelayFormField({
  label,
  hint,
  error,
  required = false,
  children,
  className = '',
}: {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <label
      className={`relay-form-field${error ? ' relay-form-field-error' : ''}${className ? ` ${className}` : ''}`}
    >
      <span className="relay-form-field-label">
        {label}
        {required && <b aria-hidden="true"> *</b>}
      </span>
      {children}
      {hint && !error && <small>{hint}</small>}
      {error && <small role="alert">{error}</small>}
    </label>
  )
}

export function RelayList({
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLUListElement> & { children: ReactNode }) {
  return (
    <ul {...props} className={`relay-list${className ? ` ${className}` : ''}`}>
      {children}
    </ul>
  )
}

export function RelayListItem({
  title,
  subtitle,
  meta,
  leading,
  trailing,
  onClick,
  className = '',
}: {
  title: ReactNode
  subtitle?: ReactNode
  meta?: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
  onClick?: () => void
  className?: string
}) {
  const content = (
    <>
      {leading && <span className="relay-list-item-leading">{leading}</span>}
      <span className="relay-list-item-content">
        <strong>{title}</strong>
        {subtitle && <span>{subtitle}</span>}
        {meta && <small>{meta}</small>}
      </span>
      {trailing && <span className="relay-list-item-trailing">{trailing}</span>}
    </>
  )
  return (
    <li className={`relay-list-item${className ? ` ${className}` : ''}`}>
      {onClick ? (
        <button type="button" onClick={onClick}>
          {content}
        </button>
      ) : (
        <div>{content}</div>
      )}
    </li>
  )
}

export function SlidingSegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel = 'Options',
  scale = 1,
  size = 'default',
  className = '',
  cardExclusion,
}: {
  options: ReadonlyArray<{ value: T; label: ReactNode }>
  value: T
  onChange: (value: T) => void
  ariaLabel?: string
  scale?: number
  size?: 'default' | 'map'
  className?: string
  cardExclusion?: string
}) {
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  )

  return (
    <div
      className={`relay-segmented-control${size !== 'default' ? ` relay-segmented-control-size-${size}` : ''}${className ? ` ${className}` : ''}`}
      data-relay-card-exclusion={cardExclusion}
      role="tablist"
      aria-label={ariaLabel}
      style={
        {
          '--relay-segment-count': options.length,
          '--relay-segment-index': activeIndex,
          '--relay-segment-scale': scale,
        } as CSSProperties
      }
    >
      <span className="relay-segmented-indicator" aria-hidden="true" />
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className="relay-segmented-option"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
