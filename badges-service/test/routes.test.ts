/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-30
 * Scope: Route tests through fastify.inject.
 * Reviewed by Ngooi Jun Sen
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { handleOrderEvent } from '../src/messaging/orderEvents.js';
import { orderMessage } from './helpers.js';

const OTHER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const app = buildApp();

beforeAll(async () => {
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('health', () => {
  it('answers /health and /health/db', async () => {
    expect((await app.inject({ url: '/health' })).json()).toEqual({ service: 'badges-service', status: 'ok' });
    expect((await app.inject({ url: '/health/db' })).json()).toEqual({ status: 'ok', db: 'up' });
  });
});

describe('GET /api/v1/badges/:userId', () => {
  it('returns every catalog badge for the owner, earned ones first in display order', async () => {
    const message = orderMessage();
    await handleOrderEvent(JSON.stringify(message));
    const courierId = message.courierId as string;

    const response = await app.inject({ url: `/api/v1/badges/${courierId}`, headers: { 'x-user-id': courierId } });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({ userId: courierId, earnedCount: 1, totalCount: 7 });
    expect(body.metricsAsOf).not.toBeNull();

    const first = body.badges.find((b: { badgeId: string }) => b.badgeId === 'first_delivery');
    expect(first).toMatchObject({ earned: true, progress: null, iconUrl: '/badges/first-run.svg' });
    expect(first.earnedAt).not.toBeNull();

    const ten = body.badges.find((b: { badgeId: string }) => b.badgeId === 'ten_deliveries');
    expect(ten).toMatchObject({
      earned: false,
      earnedAt: null,
      progress: { current: 1, target: 10 },
      criteria: [{ metric: 'completedDeliveries', op: 'gte', value: 10 }],
      iconUrl: '/badges/double-digits-locked.svg',
    });
  });

  it('shows an empty profile for a user with no activity yet', async () => {
    const userId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const body = (await app.inject({ url: `/api/v1/badges/${userId}`, headers: { 'x-user-id': userId } })).json();
    expect(body).toMatchObject({ metricsAsOf: null, earnedCount: 0, totalCount: 7 });
  });

  it("answers 404 for someone else's badges or a missing identity", async () => {
    const other = await app.inject({ url: `/api/v1/badges/${OTHER}`, headers: { 'x-user-id': 'someone-else' } });
    expect(other.statusCode).toBe(404);
    expect(other.json()).toEqual({ error: 'Endpoint not found', code: 'NOT_FOUND' });

    expect((await app.inject({ url: `/api/v1/badges/${OTHER}` })).statusCode).toBe(404);
  });

  it('rejects a user ID that is not a UUID', async () => {
    const response = await app.inject({ url: '/api/v1/badges/alice', headers: { 'x-user-id': 'alice' } });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('VALIDATION_ERROR');
  });
});

describe('unknown routes', () => {
  it("answer with the gateway's 404 body", async () => {
    const response = await app.inject({ url: '/api/v1/badges' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Endpoint not found', code: 'NOT_FOUND' });
  });
});

describe('admin routes', () => {
  it('no longer exist: badges change on events only', async () => {
    const headers = { 'x-user-id': OTHER, 'x-is-admin': 'true' };
    const evaluate = await app.inject({ method: 'POST', url: '/api/v1/badges/admin/evaluate', headers });
    expect(evaluate.statusCode).toBe(404);
  });
});
