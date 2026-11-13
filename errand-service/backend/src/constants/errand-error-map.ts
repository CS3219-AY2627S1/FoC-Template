// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-10-24
// Scope: Formatted the author-defined mapping from internal errand errors to user readable error messages and status codes.
// Author review: The errors were defined manually by the author, AI only assisted with implementing the
// mapping. The output was reviewed and corrected for minor syntax.

import { ErrandErrors } from '@relay/contracts'

/** Maps internal repository error messages to API error responses */
export const ERRAND_ERROR_MAP = {
  'ERRAND NOT FOUND': {
    code: ErrandErrors.NOT_FOUND,
    userMessage: 'Errand was not found.',
    statusCode: 404,
  },
  'ERRAND ALREADY ACCEPTED': {
    code: ErrandErrors.INVALID_TRANSITION,
    userMessage: 'Errand is already accepted by a courier.',
    statusCode: 409,
  },
  'ERRAND NOT IN OPEN': {
    code: ErrandErrors.INVALID_TRANSITION,
    userMessage: 'Errand was not in expected state: OPEN.',
    statusCode: 409,
  },
  'REQUESTER CANNOT ACCEPT OWN ERRAND': {
    code: ErrandErrors.FORBIDDEN,
    userMessage: 'You (a requestor) cannot accept your own errand.',
    statusCode: 403,
  },
  'MAX ERRANDS REACHED': {
    code: ErrandErrors.FORBIDDEN,
    userMessage: 'You already have the maximum number of errands assigned',
    statusCode: 403,
  },
  'ERRAND ALREADY CANCELLED': {
    code: ErrandErrors.INVALID_TRANSITION,
    userMessage: 'Errand is already cancelled.',
    statusCode: 409,
  },
  'ONLY REQUESTER CAN CANCEL': {
    code: ErrandErrors.FORBIDDEN,
    userMessage: 'Only the requester can cancel this errand.',
    statusCode: 403,
  },
  'ERRAND ALREADY PICKED UP': {
    code: ErrandErrors.INVALID_TRANSITION,
    userMessage: 'Errand is already picked up.',
    statusCode: 409,
  },
  'ERRAND NOT IN ACCEPTED': {
    code: ErrandErrors.INVALID_TRANSITION,
    userMessage: 'Errand was not in expected state: Accepted.',
    statusCode: 409,
  },
  'ONLY COURIER CAN PICK UP': {
    code: ErrandErrors.FORBIDDEN,
    userMessage: 'Only the assigned courier can pick up this errand.',
    statusCode: 403,
  },
  'ERRAND ALREADY DELIVERED': {
    code: ErrandErrors.INVALID_TRANSITION,
    userMessage: 'Errand is already delivered.',
    statusCode: 409,
  },
  'ERRAND NOT IN PICKED_UP': {
    code: ErrandErrors.INVALID_TRANSITION,
    userMessage: 'Errand was not in expected state: PICKED_UP.',
    statusCode: 409,
  },
  'ONLY COURIER CAN DELIVER': {
    code: ErrandErrors.FORBIDDEN,
    userMessage: 'Only the assigned courier can deliver this errand.',
    statusCode: 403,
  },
  'ERRAND NOT IN FOUND': {
    code: ErrandErrors.NOT_FOUND,
    userMessage: 'Errand was not found.',
    statusCode: 404,
  },
  'ERRAND ALREADY CONFIRMED': {
    code: ErrandErrors.INVALID_TRANSITION,
    userMessage: 'Errand is already confirmed.',
    statusCode: 409,
  },
  'ERRAND NOT IN DELIVERED': {
    code: ErrandErrors.INVALID_TRANSITION,
    userMessage: 'Errand was not in expected state: Delivered.',
    statusCode: 409,
  },
  'ONLY REQUESTER CAN CONFIRM': {
    code: ErrandErrors.FORBIDDEN,
    userMessage: 'Only the requester can confirm this errand.',
    statusCode: 403,
  },
  'ERRAND NOT IN TERMINAL': {
    code: ErrandErrors.NOT_FOUND,
    userMessage: 'Errand was not found or not in a terminal state.',
    statusCode: 404,
  },
  'ONLY REQUESTER CAN DELETE': {
    code: ErrandErrors.FORBIDDEN,
    userMessage: 'Only the requester can delete this errand.',
    statusCode: 403,
  },
  'ERRAND ALREADY DELETED': {
    code: ErrandErrors.INVALID_TRANSITION,
    userMessage: 'Errand is already deleted.',
    statusCode: 409,
  },
  'ERRAND ALREADY EXPIRED': {
    code: ErrandErrors.INVALID_TRANSITION,
    userMessage: 'Errand is already expired.',
    statusCode: 409,
  },
  'ERRAND HAS EXPIRED': {
    code: ErrandErrors.NOT_FOUND,
    userMessage: 'Errand has expired and is no longer available.',
    statusCode: 404,
  },
  'REQUESTER DELETED': {
    code: ErrandErrors.REQUESTER_DELETED,
    userMessage: 'The requester account has been deleted.',
    statusCode: 409,
  },
} as const

export type ErrandErrorMap = typeof ERRAND_ERROR_MAP
