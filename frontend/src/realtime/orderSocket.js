/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope: Order Service frontend integration (#6/#59) - the browser's single Socket.IO connection
 *        to order-service, as designed by George: the access token goes in the handshake
 *        `auth.token`; the server disconnects at the token's expiry and the client reconnects with
 *        a fresh token; `listing:subscribe` opts into the board feed; `ready` marks the rooms as
 *        set up. Events are the thin order events listed below.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): `failed` status - listens for order:failed.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 */

import { useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import { getAccessToken, refreshAccessToken } from '../api/http'

// Payload: { orderId, status, version, occurredAt, reason?, order? }
export const ORDER_EVENTS = [
  'order:created',
  'order:accepted',
  'order:pickedUp',
  'order:delivered',
  'order:completed',
  'order:cancelled',
  'order:expired',
  'order:failed',
  'order:edited',
]

const eventListeners = new Set()
const readyListeners = new Set()
let socket = null
let listingSubscribers = 0
let authRetried = false
let retryTimer = null

const expiryMs = (token) => {
  try {
    const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof claims.exp === 'number' ? claims.exp * 1000 : 0
  } catch {
    return 0
  }
}

// The in-memory token, unless it is missing or about to expire (the server would drop us at once).
async function handshakeToken() {
  const token = getAccessToken()
  if (token && expiryMs(token) - Date.now() > 30_000) return token
  return refreshAccessToken()
}

export function connectOrderSocket() {
  if (socket) return
  socket = io({
    path: '/socket.io',
    transports: ['websocket'], // the server accepts websocket only
    autoConnect: false,
    auth: (cb) => {
      handshakeToken().then(
        (token) => cb({ token }),
        () => cb({ token: null }),
      )
    },
  })

  ORDER_EVENTS.forEach((name) =>
    socket.on(name, (payload) => eventListeners.forEach((listener) => listener(name, payload))),
  )

  // Rooms are rebuilt from the database on every connection, except the opt-in listing feed.
  socket.on('ready', () => {
    authRetried = false
    if (listingSubscribers > 0) socket.emit('listing:subscribe')
    readyListeners.forEach((listener) => listener())
  })

  // The server disconnects at token expiry and does not reconnect by itself; the auth callback
  // fetches a new token for the next handshake.
  socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect') socket.connect()
  })

  socket.on('connect_error', (err) => {
    if (socket.active) return // transport failure: socket.io retries with backoff on its own
    clearTimeout(retryTimer)
    if (err.message === 'unauthorized' && !authRetried) {
      authRetried = true
      refreshAccessToken().then(
        () => socket?.connect(),
        () => {}, // session gone: the next login connects again
      )
    } else if (err.message === 'identity_provider_unavailable') {
      retryTimer = setTimeout(() => socket?.connect(), 5000)
    }
  })

  socket.connect()
}

export function disconnectOrderSocket() {
  clearTimeout(retryTimer)
  socket?.disconnect()
  socket = null
  authRetried = false
}

// Board feed opt-in, reference counted so two screens do not unsubscribe each other.
export function subscribeListing() {
  listingSubscribers += 1
  if (listingSubscribers === 1 && socket?.connected) socket.emit('listing:subscribe')
  return () => {
    listingSubscribers -= 1
    if (listingSubscribers === 0 && socket?.connected) socket.emit('listing:unsubscribe')
  }
}

// Calls handler(name, payload) for every order event while the component is mounted.
export function useOrderEvents(handler) {
  const latest = useRef(handler)
  useEffect(() => {
    latest.current = handler
  })
  useEffect(() => {
    const listener = (name, payload) => latest.current(name, payload)
    eventListeners.add(listener)
    return () => eventListeners.delete(listener)
  }, [])
}

// Calls handler() each time the socket is (re)connected with its rooms in place. Events sent while
// disconnected are not replayed, so screens refetch here.
export function useSocketReady(handler) {
  const latest = useRef(handler)
  useEffect(() => {
    latest.current = handler
  })
  useEffect(() => {
    const listener = () => latest.current()
    readyListeners.add(listener)
    return () => readyListeners.delete(listener)
  }, [])
}

// Records every order event from now on, so a caller can start watching before it sends a request
// and still catch a reply that lands before the response (the order id is only known then).
// next(match) resolves with the first recorded or later event that matches.
export function watchOrderEvents() {
  const seen = []
  let waiter = null
  const listener = (name, payload) => {
    seen.push({ name, payload })
    if (waiter?.match(name, payload)) waiter.resolve({ name, payload })
  }
  eventListeners.add(listener)
  return {
    next(match) {
      const hit = seen.find((e) => match(e.name, e.payload))
      if (hit) return Promise.resolve(hit)
      return new Promise((resolve) => {
        waiter = { match, resolve }
      })
    },
    stop: () => eventListeners.delete(listener),
  }
}
