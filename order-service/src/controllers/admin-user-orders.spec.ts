/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-05
 * Scope: Verified the team-specified admin order history endpoint using a local HTTP user-service stand-in.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RequestHandler } from 'express';
import request from 'supertest';
import { createApp } from '../app.js';
import type { PrismaClient } from '../db/prisma.js';

const actor = '0192f0c4-7a1e-7c3a-9b2d-3f4e5a6b7c8d';
const target = '0192f0c4-7a1e-7c3a-9b2d-3f4e5a6b7c8e';
let upstreamStatus = 200;
const lookups: {
  path: string | undefined;
  authorization: string | undefined;
}[] = [];
const upstream = createServer((req, res) => {
  lookups.push({ path: req.url, authorization: req.headers.authorization });
  res.writeHead(upstreamStatus).end('{}');
});
const findMany = vi.fn();
const count = vi.fn();
const prisma = { orderRequest: { findMany, count } } as unknown as PrismaClient;
const authenticate: RequestHandler = (req, _res, next) => {
  if (req.headers.authorization)
    req.user = { user_id: actor, role: req.get('x-role') ?? 'user' };
  next();
};
let baseUrl: string;
const get = (suffix = '', role = 'admin') =>
  request(createApp({ prisma, authenticate, userServiceUrl: baseUrl }))
    .get(`/orders/admin/users/${target}${suffix}`)
    .set('Authorization', 'Bearer synthetic-test-token')
    .set('x-role', role);

beforeAll(async () => {
  await new Promise<void>((resolve) =>
    upstream.listen(0, '127.0.0.1', resolve),
  );
  baseUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    upstream.close((error) => (error ? reject(error) : resolve())),
  );
});
beforeEach(() => {
  vi.clearAllMocks();
  upstreamStatus = 200;
  lookups.length = 0;
  count.mockResolvedValue(0);
  findMany.mockResolvedValue([]);
});

describe('GET /orders/admin/users/:userId', () => {
  it.each(['admin', 'super admin'])(
    'returns both roles and page metadata for %s',
    async (role) => {
      const rows = [
        {
          id: 'order1',
          requesterId: target,
          courierId: actor,
          status: 'completed',
        },
        {
          id: 'order2',
          requesterId: actor,
          courierId: target,
          status: 'failed',
        },
      ];
      count.mockResolvedValue(23);
      findMany.mockResolvedValue(rows);
      const res = await get('?page=2', role);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        totalCount: 23,
        currentPage: 2,
        pageSize: 10,
        totalPages: 3,
        orders: [
          { order: rows[0], role: 'requester' },
          { order: rows[1], role: 'courier' },
        ],
      });
      expect(findMany).toHaveBeenCalledWith({
        where: { OR: [{ requesterId: target }, { courierId: target }] },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: 10,
        take: 10,
      });
      expect(count).toHaveBeenCalledWith({
        where: { OR: [{ requesterId: target }, { courierId: target }] },
      });
      expect(lookups).toEqual([
        {
          path: `/users/${target}`,
          authorization: 'Bearer synthetic-test-token',
        },
      ]);
    },
  );
  it('normalizes uppercase UUIDs before assigning the participation role', async () => {
    findMany.mockResolvedValue([
      { id: 'order1', requesterId: target, courierId: actor },
    ]);
    count.mockResolvedValue(1);
    const res = await request(
      createApp({ prisma, authenticate, userServiceUrl: baseUrl }),
    )
      .get(`/orders/admin/users/${target.toUpperCase()}`)
      .set('Authorization', 'Bearer synthetic-test-token')
      .set('x-role', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.orders[0].role).toBe('requester');
    expect(lookups[0]?.path).toBe(`/users/${target}`);
  });
  it('defaults to page 1 and returns an empty list for a user with no orders', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      totalCount: 0,
      currentPage: 1,
      pageSize: 10,
      totalPages: 0,
      orders: [],
    });
  });
  it('returns an empty page beyond the last page while preserving the count', async () => {
    count.mockResolvedValue(11);
    const res = await get('?page=3');
    expect(res.body).toMatchObject({
      totalCount: 11,
      currentPage: 3,
      totalPages: 2,
      orders: [],
    });
  });
  it('rejects unauthenticated callers before looking up users', async () => {
    const res = await request(
      createApp({ prisma, authenticate, userServiceUrl: baseUrl }),
    ).get(`/orders/admin/users/${target}`);
    expect(res.status).toBe(401);
    expect(lookups).toHaveLength(0);
    expect(findMany).not.toHaveBeenCalled();
  });
  it('rejects non-admins before looking up users', async () => {
    expect((await get('', 'user')).status).toBe(403);
    expect(lookups).toHaveLength(0);
    expect(findMany).not.toHaveBeenCalled();
  });
  it('rejects malformed UUIDs', async () => {
    const res = await request(
      createApp({ prisma, authenticate, userServiceUrl: baseUrl }),
    )
      .get('/orders/admin/users/not-a-uuid')
      .set('Authorization', 'Bearer synthetic-test-token')
      .set('x-role', 'admin');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'User id must be a valid UUID.' });
    expect(lookups).toHaveLength(0);
  });
  it.each(['0', '-1', '1.5', 'abc', '', '9007199254740991', '1&page=2'])(
    'rejects invalid page %s',
    async (page) => {
      expect((await get(`?page=${page}`)).status).toBe(400);
      expect(lookups).toHaveLength(0);
    },
  );
  it('rejects unsupported parameters', async () => {
    expect((await get('?search=anything')).status).toBe(400);
    expect(lookups).toHaveLength(0);
  });
  it.each([401, 403, 404, 503])(
    'handles user lookup HTTP %s without querying orders',
    async (status) => {
      upstreamStatus = status;
      const res = await get();
      expect(res.status).toBe(status);
      expect(lookups).toHaveLength(1);
      expect(findMany).not.toHaveBeenCalled();
      expect(count).not.toHaveBeenCalled();
    },
  );
  it('returns 503 for an unreachable user service', async () => {
    const failingServer = createServer();
    await new Promise<void>((resolve) =>
      failingServer.listen(0, '127.0.0.1', resolve),
    );
    const port = (failingServer.address() as AddressInfo).port;
    await new Promise<void>((resolve) => failingServer.close(() => resolve()));
    const res = await request(
      createApp({
        prisma,
        authenticate,
        userServiceUrl: `http://127.0.0.1:${port}`,
      }),
    )
      .get(`/orders/admin/users/${target}`)
      .set('Authorization', 'Bearer synthetic-test-token')
      .set('x-role', 'admin');
    expect(res.status).toBe(503);
    expect(findMany).not.toHaveBeenCalled();
  });
});
