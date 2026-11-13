// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-11-02
// Scope: Generated initial implementation, debugged implementation.
// Author review: I validated correctness and edited for style.

import { useEffect, useLayoutEffect, useRef } from 'react'
import { ErrandNotificationTypes, type ErrandNotification } from '@relay/contracts'
import { isErrandNotification } from '../notificationStore'

// AI Assistance Disclosure (rongkangw):
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-10-17
// Scope: Implemented and debugged the frontend SSE subscription/update behavior.
// Author review: Reviewed outputs, corrected phrasing and syntax, and adjusted implementation
// details to fit project requirements.

/** Keep one authenticated stream while using the latest view callbacks. */
export function useErrandNotifications(
  authenticatedSubject: string | undefined,
  onErrandUpdate: (event: ErrandNotification) => void,
  refetchErrands: () => Promise<void>,
  refetchErrandDetails: (errandId: string) => Promise<void>,
) {
  const callbacks = useRef({ onErrandUpdate, refetchErrands, refetchErrandDetails })
  useLayoutEffect(() => {
    callbacks.current = { onErrandUpdate, refetchErrands, refetchErrandDetails }
  }, [onErrandUpdate, refetchErrands, refetchErrandDetails])

  useEffect(() => {
    if (!authenticatedSubject) return
    const seen = new Set<string>()
    const source = new EventSource('/api/notifications/stream')
    source.onopen = () => {
      void callbacks.current.refetchErrands()
    }
    source.onmessage = (message) => {
      try {
        const event: unknown = JSON.parse(message.data)
        if (!isErrandNotification(event) || seen.has(event.eventId)) return
        seen.add(event.eventId)
        callbacks.current.onErrandUpdate(event)
        void callbacks.current.refetchErrands()
        if (event.type === ErrandNotificationTypes.ERRAND_STATUS_CHANGED) {
          void callbacks.current.refetchErrandDetails(event.errandId)
        }
      } catch {
        // Ignore comments and malformed payloads; EventSource handles reconnection.
      }
    }
    return () => source.close()
  }, [authenticatedSubject])
}
