import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import {
  BatchRatingsBody,
  BatchRatingsResponse,
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
  getUserRatings,
  listPendingRatings,
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

  // Badges' daily reconciliation poll. Blocked at the gateway; only badges may
  // call it over the mesh (deploy/values/services/rating.yaml).
  app.post(
    '/internal/batch',
    { schema: { body: BatchRatingsBody, response: { 200: BatchRatingsResponse } } },
    async (request) => getUserRatings(request.body.userIds),
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
};
