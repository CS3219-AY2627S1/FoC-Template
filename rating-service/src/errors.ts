/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5)
 * Scope: Generated the domain errors for a missing grant and a repeat rating.
 * Reviewed by Ngooi Jun Sen.
 */

import createError from '@fastify/error';

// Domain errors (@fastify/error): stable code + message template + HTTP status.
// The error handler in app.ts sends them as { error: message, code }.

export const RatingNotPermittedError = createError(
  'RATING_NOT_PERMITTED',
  'You have no rating to give for order %s',
  403,
);

export const RatingAlreadySubmittedError = createError(
  'RATING_ALREADY_SUBMITTED',
  'You have already rated order %s',
  409,
);
