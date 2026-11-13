// AI-assisted (Claude), reviewed and tested by Maliha
// Additional use: (Claude Code, Claude Opus 5.5), 2026-11-12: Socket.IO Redis adapter for multi-pod chat. See ai/usage-log.md, entry 009.
import { createAdapter } from '@socket.io/redis-adapter';
import express from 'express';
import { createServer } from 'node:http';
import { createClient } from 'redis';
import { Server } from 'socket.io';
import { requireAdmin, type AuthUser } from './auth';
import { setupChat } from './chat';
import * as db from './db';
import { env } from './env';
import { KEEP_MS } from './rules';

const app = express();
app.use(express.json());

app.get('/health', async (_req, res) => {
  try {
    await db.pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'db-unavailable' });
  }
});

// ── Admin: flagged messages (F10.5) ──
// Everything is under /chat so nginx can forward /backend/chat as is

app.get('/chat/flags', requireAdmin, async (req, res) => {
  const flags = await db.listFlags(req.query.include === 'reviewed');
  res.json({ flags });
});

app.post('/chat/flags/:id/review', requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  if (!/^\d+$/.test(id)) {
    res.status(400).json({ error: 'invalid-input' });
    return;
  }
  const admin = res.locals.user as AuthUser;
  if (!(await db.reviewFlag(id, admin.id))) {
    res.status(404).json({ error: 'not-found' });
    return;
  }
  res.status(204).end();
});

// Express 5 passes rejected promises here
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[http]', err);
  res.status(500).json({ error: 'internal' });
});

const server = createServer(app);
const io = new Server(server, { path: '/chat/socket.io' });
setupChat(io);

// F10.4.1: chats are deleted 1 h after the errand ends
const CLEANUP_EVERY_MS = 5 * 60_000;
const cleanup = () =>
  db.deleteOldChats(KEEP_MS)
    .then((n) => n && console.log(`[cleanup] deleted ${n} ended chat(s)`))
    .catch((err) => console.error('[cleanup]', err));

// With several chat pods, each user is connected to one of them. The Redis
// adapter passes room events between pods, so a message sent through one pod
// reaches the other person on another pod. Without REDIS_URL, rooms stay in
// this process's memory, which is enough for a single instance.
const redisClients: { quit(): Promise<unknown> }[] = []; // closed on shutdown

async function useRedisAdapter(url: string) {
  const pub = createClient({ url });
  const sub = pub.duplicate();
  for (const client of [pub, sub]) {
    // the client reconnects by itself; without a listener an error would crash the process
    client.on('error', (err) => console.error('[redis]', err));
    redisClients.push(client);
  }
  await Promise.all([pub.connect(), sub.connect()]);
  io.adapter(createAdapter(pub, sub));
  console.log('[redis] chat rooms shared across pods');
}

async function main() {
  if (env.REDIS_URL) await useRedisAdapter(env.REDIS_URL);
  await db.migrate();
  setInterval(cleanup, CLEANUP_EVERY_MS).unref();
  // every pod runs this; deleting the same ended chats twice is harmless
  cleanup();
  server.listen(env.PORT, () => console.log(`chat-service on :${env.PORT}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// let docker stop finish open requests
process.on('SIGTERM', () => {
  io.close();
  server.close(() =>
    Promise.allSettled(redisClients.map((client) => client.quit()))
      .then(() => db.pool.end())
      .then(() => process.exit(0)),
  );
});