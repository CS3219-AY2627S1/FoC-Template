/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5)
 * Scope: Generated the rating routes: averages, pending grants and submitting a
 *        score.
 * Reviewed by Ngooi Jun Sen.
 */

import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import {
  MeHeaders,
  OrderParams,
  PendingRatingsResponse,
  SubmitRatingBody,
  SubmitRatingResponse,
  UserParams,
  UserRatingResponse,
} from '../schemas/rating.js';
import {
  getUserRating,
  listPendingRatings,
  skipRating,
  submitRating,
} from '../services/rating.service.js';

// Registered under /api/v1/rating; request/response types inferred from schemas.
// Identity comes from the gateway's x-user-id header (deploy/charts/foc-gateway).
export const ratingRoutes: FastifyPluginAsyncTypebox = async (app) => {
  // Static path, so Fastify matches it before /:userId.
  app.get(
    '/me/pending',
    { schema: { headers: MeHeaders, response: { 200: PendingRatingsResponse } } },
    async (request) => listPendingRatings(request.headers['x-user-id']),
  );

  // F3 / contract: a user's unified average and the count behind it.
  app.get(
    '/:userId',
    { schema: { params: UserParams, response: { 200: UserRatingResponse } } },
    async (request) => getUserRating(request.params.userId),
  );

  // Rating modal (UI FR14). Accepted only with a grant from Order Service.
  app.post(
    '/orders/:orderId',
    {
      schema: {
        headers: MeHeaders,
        params: OrderParams,
        body: SubmitRatingBody,
        response: { 201: SubmitRatingResponse },
      },
    },
    async (request, reply) => {
      reply.code(201);
      return submitRating(request.headers['x-user-id'], request.params.orderId, request.body);
    },
  );

  // "Skip" in the rating modal (UI FR14.1.3): drops the grant from /me/pending
  // on every device. The grant stays valid, so the order can still be rated.
  app.post(
    '/orders/:orderId/skip',
    { schema: { headers: MeHeaders, params: OrderParams } },
    async (request, reply) => {
      await skipRating(request.headers['x-user-id'], request.params.orderId);
      return reply.code(204).send();
    },
  );
};
