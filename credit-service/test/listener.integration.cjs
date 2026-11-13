// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), date: 2026-10-22 - 2026-10-26 (Asia/Singapore).
// Scope: Tested the human-selected broker package with actual Credit startup, PostgreSQL allocation, duplicate delivery, dead-lettering, retry and restart. Added/tested/documented startup-only listener health with database-based HTTP status as the human specified. Scoped saved allocation checks by operation/key instead of the removed user column.
// Author review: I reviewed that the test specification is correct.
// Prompts/key responses: ../ai/usage-log.md, entry 037, 038, 045.
// Entry 047: OpenAI Codex (GPT-6), 2026-10-30 (Asia/Singapore).
// Scope: Tested real startup outages, live disconnect health/recovery and shutdown through an isolated TCP proxy.
// Changes await human review; prompts/key responses: ../ai/usage-log.md, entry 047.

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawn } = require('node:child_process');
const { createServer, connect: connectSocket } = require('node:net');
const { randomUUID, generateKeyPairSync } = require('node:crypto');
const { mkdtemp, writeFile, readFile, readdir, rm } = require('node:fs/promises');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const jwt = require('jsonwebtoken');
const { Client, Pool } = require('pg');
const amqp = require('amqplib');
const { RabbitMQClient, CREDIT_USER_QUEUE, deadLetterQueue } = require('@foc/messaging');

// Use only a dedicated empty broker: the real consumer uses CREDIT_USER_QUEUE.
test('real listener initializes once and handles retries, dead letters and restart', {
  skip: (!process.env.PGDATABASE || !process.env.RABBITMQ_TEST_URL)
    && 'Set PGDATABASE/PG variables and RABBITMQ_TEST_URL for an isolated disposable broker.',
  timeout: 45000,
}, async (t) => {
  const schema = 'listener_check_' + randomUUID().replaceAll('-', '');
  const folder = await mkdtemp(join(tmpdir(), 'credit-listener-check-'));
  const admin = new Client({ connectionTimeoutMillis: 5000 });
  const pool = new Pool({ max: 4, options: '-c search_path=' + schema, connectionTimeoutMillis: 5000 });
  const url = process.env.RABBITMQ_TEST_URL;
  const publisher = new RabbitMQClient({ url, prefetch: 10, logDir: join(folder, 'publisher') });
  let connected = false, connection, channel, child, childExit;
  let output = '';
  const transientUser = randomUUID();
  const waitFor = async (probe, label) => {
    const end = Date.now() + 8000;
    while (Date.now() < end) {
      if (await probe()) return;
      if (child?.exitCode !== null && child?.exitCode !== undefined) throw new Error('Credit exited: ' + output);
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error('Timed out: ' + label + '; ' + output);
  };
  const port = async () => {
    const server = createServer();
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const value = server.address().port;
    await new Promise(resolve => server.close(resolve));
    return value;
  };
  const logs = async () => {
    try { return (await readFile(join(folder, 'logs/rabbitmq/broker.log'), 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  };
  const waitAction = (eventId, action) => waitFor(async () =>
    (await logs()).some(row => row.eventId === eventId && row.action === action), eventId + ' ' + action);
  const receiveDeadLetter = async eventId => {
    let delivery;
    await waitFor(async () => {
      delivery = await channel.get(deadLetterQueue(CREDIT_USER_QUEUE), { noAck: false });
      return Boolean(delivery);
    }, eventId + ' available in dead-letter queue');
    assert.equal(delivery.properties.messageId, eventId);
    channel.ack(delivery);
  };
  const send = async (userId, changes = {}, messageId) => {
    const event = { type: 'user.created', eventId: randomUUID(), occurredAt: new Date().toISOString(), userId, ...changes };
    assert.equal(await publisher.publishToQueue(CREDIT_USER_QUEUE, event, messageId ?? event.eventId), true);
    return messageId ?? event.eventId;
  };
  const snapshot = async (userId) => ({
    accounts: (await pool.query('SELECT total_credits, reserved_credits FROM credit_accounts WHERE user_id = $1', [userId])).rows,
    history: (await pool.query('SELECT type, total_amount_change, total_reserved_change FROM credit_history WHERE user_id = $1 ORDER BY sequence_id', [userId])).rows,
    retryCount: (await pool.query("SELECT count(*) FROM idempotency_records WHERE operation_type = 'init_credits' AND idempotency_key = $1", [userId])).rows[0].count,
  });
  const stop = async () => {
    if (!child) return;
    const active = child;
    if (active.exitCode === null) active.kill('SIGTERM');
    const kill = setTimeout(() => active.kill('SIGKILL'), 5000);
    try { const result = await childExit; assert.equal(result.code, 0, output); }
    finally { clearTimeout(kill); child = undefined; }
  };
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicPath = join(folder, 'public.pem');
  const httpPort = await port();
  let grpcPort;
  do { grpcPort = await port(); } while (grpcPort === httpPort);
  const upstream = new URL(url);
  let proxyPort;
  do { proxyPort = await port(); } while (proxyPort === httpPort || proxyPort === grpcPort);
  const proxyUrl = new URL(url);
  proxyUrl.hostname = '127.0.0.1'; proxyUrl.port = String(proxyPort);
  const sockets = new Set();
  const proxy = createServer(incoming => {
    const outgoing = connectSocket({ host: upstream.hostname, port: Number(upstream.port || 5672) });
    for (const socket of [incoming, outgoing]) {
      sockets.add(socket);
      socket.on('error', () => { incoming.destroy(); outgoing.destroy(); });
      socket.on('close', () => { sockets.delete(socket); incoming.destroy(); outgoing.destroy(); });
    }
    incoming.pipe(outgoing).pipe(incoming);
  });
  const openProxy = () => new Promise((resolve, reject) => {
    const fail = error => { proxy.off('listening', ready); reject(error); };
    const ready = () => { proxy.off('error', fail); resolve(); };
    proxy.once('error', fail); proxy.once('listening', ready); proxy.listen(proxyPort, '127.0.0.1');
  });
  const closeProxy = async () => {
    for (const socket of sockets) socket.destroy();
    if (proxy.listening) await new Promise(resolve => proxy.close(resolve));
  };
  const health = async () => {
    const response = await fetch('http://127.0.0.1:' + httpPort + '/health');
    assert.equal(response.status, 200);
    return response.json();
  };
  const start = async (waitForListener = true) => {
    output = '';
    const script = `
      const { CreditService } = require(${JSON.stringify(resolve(__dirname, '../dist/services/CreditService.js'))});
      const original = CreditService.prototype.initCredits;
      let failed = false;
      CreditService.prototype.initCredits = async function(input) {
        if (input.userId === ${JSON.stringify(transientUser)} && !failed) {
          failed = true; throw new Error('Injected transient initialization failure');
        }
        return original.call(this, input);
      };
      (async () => {
        const { Client } = require(${JSON.stringify(require.resolve('pg'))});
        const check = new Client({ connectionTimeoutMillis: 5000 });
        try {
          await check.connect();
          const { rows } = await check.query('SELECT current_schema() AS name');
          if (rows[0].name !== ${JSON.stringify(schema)}) throw new Error('Listener database schema isolation failed');
        } finally { await check.end(); }
        require(${JSON.stringify(resolve(__dirname, '../dist/index.js'))});
      })().catch(error => { console.error(error); process.exitCode = 1; });
    `;
    child = spawn(process.execPath, ['-e', script], { cwd: folder, env: {
      ...process.env, DOTENV_CONFIG_PATH: '/dev/null', PGOPTIONS: '-c search_path=' + schema,
      RABBITMQ_URL: proxyUrl.toString(), CREDIT_ORDER_SERVICE_TOKEN: 'listener-test-token', CREDIT_JWT_PUBLIC_KEY_PATH: publicPath,
      HTTP_HOST: '127.0.0.1', HTTP_PORT: String(httpPort), GRPC_HOST: '127.0.0.1', GRPC_PORT: String(grpcPort),
    }, stdio: ['ignore', 'pipe', 'pipe'] });
    childExit = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
    child.stdout.on('data', bytes => { output += bytes; });
    child.stderr.on('data', bytes => { output += bytes; });
    await waitFor(() => output.includes('credit-service REST listening'), 'REST ready');
    if (waitForListener) await waitFor(() => output.includes('credit user-event listener ready'), 'listener ready');
  };
  try {
    await writeFile(publicPath, pair.publicKey.export({ type: 'spki', format: 'pem' }));
    await admin.connect(); connected = true;
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`SET search_path TO "${schema}"`);
    for (const file of (await readdir(join(__dirname, '../migrations'))).filter(name => /^\d+_.+\.sql$/.test(name)).sort()) {
      await admin.query(await readFile(join(__dirname, '../migrations', file), 'utf8'));
    }
    connection = await amqp.connect(url);
    channel = await connection.createChannel();
    await publisher.connect();
    // Abort if the queue is already in use; never purge or consume someone else's data.
    await publisher.assertQueueWithDeadLetter(CREDIT_USER_QUEUE);
    const before = await channel.checkQueue(CREDIT_USER_QUEUE);
    assert.equal(before.messageCount, 0, 'Use an empty dedicated test broker');
    assert.equal(before.consumerCount, 0, 'Use a dedicated test broker without existing Credit consumers');
    await start(false);
    await t.test('startup broker outage keeps health/database up and recovers without a service restart', async () => {
      await waitFor(() => output.includes('Credit user-event consumer unavailable'), 'initial connection failure');
      assert.deepEqual(await health(), { status: 'ok', db: 'up', listener: 'down' });
      const pid = child.pid;
      await openProxy();
      await waitFor(async () => (await health()).listener === 'up', 'startup retry recovery');
      assert.equal(child.pid, pid);
      assert.equal((await channel.checkQueue(CREDIT_USER_QUEUE)).consumerCount, 1);
    });
    const userId = randomUUID();
    let firstEvent;
    await t.test('registration delivery creates one 10-credit account visible through authenticated REST', async () => {
      firstEvent = await send(userId);
      await waitAction(firstEvent, 'acked');
      const token = jwt.sign({ sub: userId }, pair.privateKey, { algorithm: 'RS256', expiresIn: 120 });
      const response = await fetch('http://127.0.0.1:' + httpPort + '/credits/me/balance', { headers: { authorization: 'Bearer ' + token } });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { userId, totalCredits: 10, reservedCredits: 0, availableCredits: 10 });
      assert.deepEqual(await snapshot(userId), {
        accounts: [{ total_credits: 10, reserved_credits: 0 }],
        history: [{ type: 'INITIAL_GRANT', total_amount_change: 10, total_reserved_change: 0 }], retryCount: '1',
      });
    });
    await t.test('same event and different events for one user cannot grant twice', async () => {
      const before = await snapshot(userId);
      await send(userId, { eventId: firstEvent });
      const second = await send(userId);
      await waitAction(second, 'acked');
      assert.deepEqual(await snapshot(userId), before);
    });
    await t.test('later disconnect reports down, recovers consumers once, and processes another registration', async () => {
      const pid = child.pid;
      await closeProxy();
      await waitFor(async () => (await health()).listener === 'down', 'disconnected health');
      await openProxy();
      await waitFor(async () => (await health()).listener === 'up', 'restored consumer health');
      assert.equal(child.pid, pid);
      assert.equal((await channel.checkQueue(CREDIT_USER_QUEUE)).consumerCount, 1);
      const recoveredUser = randomUUID();
      const eventId = await send(recoveredUser);
      await waitAction(eventId, 'acked');
      assert.deepEqual(await snapshot(recoveredUser), {
        accounts: [{ total_credits: 10, reserved_credits: 0 }],
        history: [{ type: 'INITIAL_GRANT', total_amount_change: 10, total_reserved_change: 0 }], retryCount: '1',
      });
    });
    await t.test('transient handler failure retries and then allocates once', async () => {
      const eventId = await send(transientUser);
      await waitAction(eventId, 'acked');
      assert.ok((await logs()).some(row => row.eventId === eventId && row.action === 'retry' && row.retryCount === 1));
      assert.equal((await snapshot(transientUser)).history.length, 1);
    });
    await t.test('mismatched delivery ID dead-letters without creating an account', async () => {
      const badUser = randomUUID();
      const eventId = await send(badUser, {}, randomUUID());
      await waitAction(eventId, 'dead-letter');
      await receiveDeadLetter(eventId);
      assert.deepEqual(await snapshot(badUser), { accounts: [], history: [], retryCount: '0' });
    });
    await t.test('inconsistent pre-existing account dead-letters without new writes', async () => {
      const badUser = randomUUID();
      await pool.query('INSERT INTO credit_accounts (user_id, total_credits) VALUES ($1, 10)', [badUser]);
      const before = await snapshot(badUser);
      const eventId = await send(badUser);
      await waitAction(eventId, 'dead-letter');
      await receiveDeadLetter(eventId);
      assert.deepEqual(await snapshot(badUser), before);
    });
    await t.test('listener restart preserves allocation and consumes a later duplicate', async () => {
      const before = await snapshot(userId);
      await stop();
      const duplicate = await send(userId);
      await start();
      await waitAction(duplicate, 'acked');
      assert.deepEqual(await snapshot(userId), before);
    });
    await t.test('shutdown during broker startup backoff exits without waiting for the retry', async () => {
      await stop();
      await closeProxy();
      await start(false);
      await waitFor(() => output.includes('Credit user-event consumer unavailable'), 'startup retry scheduled');
      await stop();
    });
  } finally {
    try { await stop(); }
    finally {
      await closeProxy();
      await Promise.allSettled([publisher.close(), channel?.close()]);
      if (connection) await connection.close();
      await pool.end();
      try { if (connected) await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
      finally { await admin.end(); await rm(folder, { recursive: true, force: true }); }
    }
  }
});
