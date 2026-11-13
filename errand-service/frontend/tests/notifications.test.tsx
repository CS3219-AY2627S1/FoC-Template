import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Errand, ErrandNotification, ErrandRemoteProps } from '@relay/contracts'
import { useNotificationHistory, NOTIFICATION_POPUP_MS } from '../src/hooks/useNotificationHistory'
import { useErrandNotifications } from '../src/hooks/useErrandNotifications'
import App from '../src/App'

vi.mock('../src/components/ErrandMap', () => ({
  ErrandMap: () => <div>Map</div>,
  getErrandAnchor: vi.fn(),
}))

const event = (eventId = 'event-1'): ErrandNotification => ({
  eventId,
  errandId: 'errand-1',
  type: 'ERRAND_STATUS_CHANGED',
  timestamp: '2026-11-09T10:00:00Z',
  oldStatus: 'ACCEPTED',
  newStatus: 'PICKED_UP',
})
const location = { lat: 1.2966, lng: 103.7764, buildingName: 'Library', floorNumber: 1 }
const errand: Errand = {
  id: 'errand-1',
  name: 'Lunch delivery',
  status: 'PICKED_UP',
  requesterSub: 'alice',
  courierSub: 'bob',
  courierProfile: null,
  supplierDetails: { supplierId: 'supplier-1', supplierName: 'Cafe', serviceType: 0 },
  pickupLocation: location,
  targetLocation: location,
  deliveryDetails: { description: 'Lunch' },
  creditAmount: 5,
  startAt: '2026-11-09T09:00:00Z',
  expiresAt: '2026-11-09T12:00:00Z',
  confirmationDeadline: null,
  createdAt: '2026-11-09T09:00:00Z',
  updatedAt: '2026-11-09T10:00:00Z',
}
class FakeEventSource {
  static instances: FakeEventSource[] = []
  onmessage: ((message: { data: string }) => void) | null = null
  onopen: (() => void) | null = null
  close = vi.fn()
  constructor() {
    FakeEventSource.instances.push(this)
  }
  send(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) })
  }
}

beforeEach(() => {
  window.localStorage.clear()
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const props = () => {
  const errandApi = {
    getErrands: vi.fn().mockResolvedValue({ errands: [] }),
    getErrand: vi.fn().mockResolvedValue({ errand }),
  }
  return {
    authenticatedSubject: 'alice',
    errandViewContext: { view: 'requests' },
    mapActive: true,
    presentation: 'full',
    errandApi,
  } as unknown as ErrandRemoteProps
}
const deliver = async (value = event()) => {
  await act(async () => {
    FakeEventSource.instances.at(-1)!.send(value)
  })
}

describe('popup queue', () => {
  it('times out one popup every 12 seconds, retaining all history', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useNotificationHistory('alice', false))
    act(() => {
      result.current.store.add(event('one'), 'Lunch')
      result.current.store.add(event('two'), 'Lunch')
    })
    expect(result.current.popup?.eventId).toBe('one')
    act(() => vi.advanceTimersByTime(NOTIFICATION_POPUP_MS - 1))
    expect(result.current.popup?.eventId).toBe('one')
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.popup?.eventId).toBe('two')
    act(() => vi.advanceTimersByTime(NOTIFICATION_POPUP_MS))
    expect(result.current.popup).toBeUndefined()
    expect(result.current.notifications).toHaveLength(2)
  })

  it('pauses while the list or MFE is hidden and isolates account switches', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ paused, subject }) => useNotificationHistory(subject, paused),
      {
        initialProps: { paused: true, subject: 'alice' },
      },
    )
    act(() => result.current.store.add(event(), 'Lunch'))
    act(() => vi.advanceTimersByTime(30_000))
    expect(result.current.popup?.eventId).toBe('event-1')
    rerender({ paused: false, subject: 'alice' })
    act(() => vi.advanceTimersByTime(NOTIFICATION_POPUP_MS))
    expect(result.current.popup).toBeUndefined()
    rerender({ paused: false, subject: 'bob' })
    expect(result.current.notifications).toEqual([])
  })
})

describe('SSE connection', () => {
  it('stays connected across callback changes, ignores duplicates, and closes on account changes', () => {
    const first = vi.fn(),
      latest = vi.fn(),
      refresh = vi.fn().mockResolvedValue(undefined)
    const { rerender, unmount } = renderHook(
      ({ subject, callback }) => useErrandNotifications(subject, callback, refresh, refresh),
      {
        initialProps: { subject: 'alice', callback: first },
      },
    )
    const source = FakeEventSource.instances[0]
    rerender({ subject: 'alice', callback: latest })
    act(() => {
      source.send(event())
      source.send(event())
      source.send({ junk: true })
    })
    expect(first).not.toHaveBeenCalled()
    expect(latest).toHaveBeenCalledTimes(1)
    expect(FakeEventSource.instances).toHaveLength(1)
    rerender({ subject: 'bob', callback: latest })
    expect(source.close).toHaveBeenCalledTimes(1)
    unmount()
    expect(FakeEventSource.instances[1].close).toHaveBeenCalledTimes(1)
  })
})

describe('Updates UI', () => {
  it('dismisses popups, retains list entries, and requires confirmation before deletion', async () => {
    render(<App {...props()} />)
    await deliver()
    expect(screen.getByText('Accepted → Collected')).toBeTruthy()
    expect(document.querySelector('.relay-button-notification-dot')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(screen.queryByText('Accepted → Collected')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Updates' }))
    const card = screen.getByRole('region', { name: 'Lunch delivery notification' })
    fireEvent.click(
      within(card).getByRole('button', { name: 'Remove notification for Lunch delivery' }),
    )
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByText('Accepted → Collected')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove notification for Lunch delivery' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete notification' }))
    expect(screen.getByText('No notifications yet.')).toBeTruthy()
    await deliver()
    expect(screen.getByText('No notifications yet.')).toBeTruthy()
  })

  it('opens details for an event outside the current map list', async () => {
    const appProps = props()
    render(<App {...appProps} />)
    await deliver()
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Open Lunch delivery details' })),
    )
    expect(screen.getByLabelText('Lunch delivery details')).toBeTruthy()
    expect(appProps.errandApi!.getErrand).toHaveBeenCalledWith('errand-1')
  })

  it('keeps inaccessible/deleted events in history with an explanation', async () => {
    const appProps = props()
    vi.mocked(appProps.errandApi!.getErrand).mockRejectedValue(new Error('404'))
    render(<App {...appProps} />)
    await deliver({ ...event(), type: 'ERRAND_DELETED', newStatus: 'DELETED' })
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Open Errand errand-1 details' })),
    )
    expect(screen.getByText(/Unable to open this errand/)).toBeTruthy()
    expect(screen.getByText('Errand deleted')).toBeTruthy()
  })
})

it('shows the same saved Updates history as an overlay without a map and closes through the host', async () => {
  const appProps = props()
  const navigateTo = vi.fn()
  const context = {
    view: 'updates' as const,
    anchor: { top: 600, left: 20, right: 120, bottom: 650 },
  }
  const { rerender } = render(<App {...appProps} navigateTo={navigateTo} />)
  await deliver()
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))
  rerender(
    <App
      {...appProps}
      navigateTo={navigateTo}
      presentation="card"
      mapActive={false}
      errandViewContext={context}
    />,
  )
  expect(screen.queryByText('Map')).toBeNull()
  expect(screen.queryByRole('button', { name: 'New request' })).toBeNull()
  expect(screen.getByText('Accepted → Collected')).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Updates' })).toBeTruthy()
  expect(document.querySelector('.errand-updates-popover')?.getAttribute('style')).toContain(
    'left: 20px',
  )
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Open Lunch delivery details' })),
  )
  expect(screen.getByLabelText('Lunch delivery details')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Close errand details' }))
  expect(screen.getByRole('heading', { name: 'Updates' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Remove notification for Lunch delivery' }))
  fireEvent.click(screen.getByRole('button', { name: 'Delete notification' }))
  expect(screen.getByText('No notifications yet.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(navigateTo).toHaveBeenCalledWith('supplier')
})
