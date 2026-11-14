/*
 * AI Assistance Disclosure:
 * Scope (2026-11-08, Codex, model: GPT-6): Updated test fixtures for precise delivery details.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope: Issues #6/#59 - end-to-end Socket.IO tests against a real Postgres: handshake
 *        auth, room membership from the DB, joining the order room on accept, closing it
 *        at a terminal state, listing opt-in, one delivery per socket across rooms,
 *        disconnect at token expiry, and NFR5.1.1 measured as written (client request
 *        sent -> server broadcasts the event) under 2 s. Single process, in-memory
 *        adapter (no Redis in the test environment).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): Tokens are verified by Wen Xi's JWKS verifier against a local
 *        JWKS endpoint (George, 2026-10-20: keep her auth); the expiry test uses a 2 s exp.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 */

import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { config as loadDotenv } from 'dotenv';
import { io as connect, type Socket } from 'socket.io-client';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { createPrismaClient } from '../src/db/prisma.js';
import type { OrderEvent } from '../src/realtime/order-events.js';
import { createSocketServer } from '../src/realtime/socket-server.js';
import { createSocketSink } from '../src/realtime/socket-sink.js';
import { createTestKeys, type TestKeys } from './helpers/tokens.js';

loadDotenv({ quiet: true });
const prisma = createPrismaClient(loadEnv().DATABASE_URL);

const REQUESTER = '0192f0c4-0000-7000-8000-0000000000aa';
const COURIER = '0192f0c4-0000-7000-8000-0000000000bb';
const STRANGER = '0192f0c4-0000-7000-8000-0000000000cc';

let keys: TestKeys;
let httpServer: HttpServer;
let url: string;
let app: ReturnType<typeof createApp>;
let ioServer: ReturnType<typeof createSocketServer>;
const broadcasts: { event: OrderEvent; at: number }[] = [];
const sockets: Socket[] = [];

beforeAll(async () => {
  keys = await createTestKeys();
  httpServer = createServer();
  ioServer = createSocketServer(httpServer, {
    prisma,
    verifyToken: keys.verifier,
    log: () => {},
  });
  const events = createSocketSink(ioServer, {
    onBroadcast: (event, at) => broadcasts.push({ event, at }),
  });
  app = createApp({ prisma, authenticate: keys.authenticate, events });
  httpServer.on('request', app);
  await new Promise<void>((resolve) =>
    httpServer.listen(0, '127.0.0.1', resolve),
  );
  url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => ioServer.close(() => resolve()));
  await keys.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  broadcasts.length = 0;
  await prisma.outbox.deleteMany();
  await prisma.orderRequest.deleteMany();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  for (const s of sockets.splice(0)) s.disconnect();
});

/** Connects with a token and resolves once the server has set up its rooms. */
async function client(
  token: string,
): Promise<Socket & { got: [string, unknown][] }> {
  const socket = connect(url, {
    transports: ['websocket'],
    auth: { token },
    forceNew: true,
    reconnection: false,
  }) as Socket & { got: [string, unknown][] };
  socket.got = [];
  socket.onAny((name: string, payload: unknown) =>
    socket.got.push([name, payload]),
  );
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('ready', () => resolve());
    socket.once('connect_error', reject);
  });
  return socket;
}

const until = async (check: () => boolean, ms = 2000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 10));
  }
};

const names = (s: { got: [string, unknown][] }) =>
  s.got.map(([n]) => n).filter((n) => n !== 'ready');

async function openOrder() {
  return prisma.orderRequest.create({
    data: {
      requesterId: REQUESTER,
      supplierId: 1,
      description: 'kopi',
      deliveryLocationId: 3,
      deliveryDetails: 'Nil',
      credits: 2,
      status: 'open',
      version: 1,
    },
  });
}

describe('Socket.IO handshake', () => {
  it('rejects a connection without a token', async () => {
    const socket = connect(url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    sockets.push(socket);
    const err = await new Promise<Error>((resolve) =>
      socket.once('connect_error', resolve),
    );
    expect(err.message).toBe('unauthorized');
  });

  it('rejects a token from another key', async () => {
    const other = await createTestKeys();
    await expect(client(await other.sign(COURIER))).rejects.toThrow(
      'unauthorized',
    );
    await other.close();
  });

  it('disconnects the socket when its token expires', async () => {
    const token = await keys.sign(COURIER, {
      // 2 s, not 1: exp is in whole seconds and must still be in the future when the
      // handshake is verified.
      expiresIn: Math.floor(Date.now() / 1000) + 2,
    });
    const socket = await client(token);
    const reason = await new Promise<string>((resolve) =>
      socket.once('disconnect', resolve),
    );
    expect(reason).toBe('io server disconnect');
  });
});

describe('order events over sockets', () => {
  it('accept: NFR5.1.1 under 2 s; requester, courier and feed each get it once; strangers do not', async () => {
    const order = await openOrder();
    const requester = await client(await keys.sign(REQUESTER)); // in order room via the DB
    const courier = await client(await keys.sign(COURIER));
    courier.emit('listing:subscribe');
    const stranger = await client(await keys.sign(STRANGER)); // not subscribed
    await new Promise((r) => setTimeout(r, 50)); // let the subscribe land

    const sentAt = Date.now(); // NFR5.1.1: client request sent ...
    await request(app)
      .post(`/orders/${order.id}/accept`)
      .set('authorization', `Bearer ${await keys.sign(COURIER)}`)
      .expect(200);
    await until(() => names(requester).includes('order:accepted'));

    const broadcast = broadcasts.find((b) => b.event.name === 'order:accepted');
    expect(broadcast).toBeDefined();
    expect(broadcast!.at - sentAt).toBeLessThan(2000); // ... to server broadcasts the event

    await until(() => names(courier).includes('order:accepted'));
    expect(names(requester)).toEqual(['order:accepted']);
    // Courier is in user:C, listing and now order:{id}: still exactly one delivery.
    expect(names(courier)).toEqual(['order:accepted']);
    expect(names(stranger)).toEqual([]);
    expect(requester.got.at(-1)![1]).toMatchObject({
      orderId: order.id,
      status: 'accepted',
      version: 2,
    });
  });

  it('the courier joins the order room on accept and hears later changes; the room closes at the end', async () => {
    const order = await openOrder();
    const requester = await client(await keys.sign(REQUESTER));
    const courier = await client(await keys.sign(COURIER)); // connected before accepting
    const courierToken = await keys.sign(COURIER);
    const requesterToken = await keys.sign(REQUESTER);

    await request(app)
      .post(`/orders/${order.id}/accept`)
      .set('authorization', `Bearer ${courierToken}`)
      .expect(200);
    await request(app)
      .post(`/orders/${order.id}/pickup`)
      .set('authorization', `Bearer ${courierToken}`)
      .expect(200);
    await request(app)
      .post(`/orders/${order.id}/deliver`)
      .set('authorization', `Bearer ${courierToken}`)
      .expect(200);
    await request(app)
      .post(`/orders/${order.id}/complete`)
      .set('authorization', `Bearer ${requesterToken}`)
      .expect(200);

    const flow = [
      'order:accepted',
      'order:pickedUp',
      'order:delivered',
      'order:completed',
    ];
    await until(
      () => names(courier).length === 4 && names(requester).length === 4,
    );
    expect(names(courier)).toEqual(flow);
    expect(names(requester)).toEqual(flow);

    // Completed: nobody is left in the order room.
    const members = await ioServer.in(`order:${order.id}`).fetchSockets();
    expect(members).toHaveLength(0);
  });

  it('a reconnecting user is put back into their active order rooms', async () => {
    const order = await prisma.orderRequest.update({
      where: { id: (await openOrder()).id },
      data: { status: 'accepted', courierId: COURIER, version: 2 },
    });
    const courier = await client(await keys.sign(COURIER));
    const members = await ioServer.in(`order:${order.id}`).fetchSockets();
    expect(members.map((m) => m.id)).toContain(courier.id);
  });

  it('listing:unsubscribe stops feed events', async () => {
    const courier = await client(await keys.sign(COURIER));
    courier.emit('listing:subscribe');
    courier.emit('listing:unsubscribe');
    await new Promise((r) => setTimeout(r, 50));
    const order = await openOrder();

    await request(app)
      .patch(`/orders/${order.id}/edit`)
      .set('authorization', `Bearer ${await keys.sign(REQUESTER)}`)
      .send({ description: 'teh', deliveryDetails: 'Nil' })
      .expect(200);
    await new Promise((r) => setTimeout(r, 100));
    expect(names(courier)).toEqual([]);
  });
});
