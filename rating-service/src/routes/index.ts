/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5)
 * Scope: Generated route registration.
 * Reviewed by Ngooi Jun Sen.
 */

import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.js';
import { ratingRoutes } from './rating.routes.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoutes);
  await app.register(ratingRoutes, { prefix: '/api/v1/rating' });
}
