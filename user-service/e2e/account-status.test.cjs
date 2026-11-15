// AI assistance: Codex (GPT-6), 2026-10-18. Scope: real HTTP/Kafka/Credit flow. Author review: Reviewed and approved by @phuc.
// Additional AI assistance: OpenAI Codex, 2026-11-09. Scope: approved initial-event replay and exact grant assertions. Review: Reviewed and approved by @ron on 2026-11-09.
// Additional AI assistance: OpenAI Codex, 2026-11-10. Scope: configure the fixture for Credit's merged HTTP contract and distinct test ports (#62). Review: pending for this compatibility follow-up.
// Run against isolated PostgreSQL and Kafka with all five topics provisioned. Never use a shared broker:
// Credit Service uses its production consumer-group name, and this test starts a real consumer.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');
const path = require('node:path');
const { it } = require('node:test');
const { createTestDatabase, waitFor } = require('../test/helpers.ts');
const { createTestDatabase: createCreditDatabase } = require('../../credit-service/test/helpers.ts');

it('HTTP registration survives unavailable Kafka, catches up after restart, and publishes suspend/restore safely',
  { skip: !process.env.TEST_DATABASE_URL || !process.env.KAFKA_BROKERS, timeout: 90_000 }, async () => {
    const brokers = process.env.KAFKA_BROKERS;
    const userDb = await createTestDatabase();
    let creditDb;
    let harness;
    const children = new Set();
    let logs = '';
    function launch(cwd, env) {
      const child = spawn(process.execPath, ['dist/index.js'], { cwd, env: { ...process.env, ...env }, windowsHide: true });
      children.add(child);
      child.stdout.on('data', (data) => { logs += data; });
      child.stderr.on('data', (data) => { logs += data; });
      return child;
    }
    async function stop(child) {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
    try {
      creditDb = await createCreditDatabase();
      process.env.E2E_DATABASE_URL = creditDb.pool.options.connectionString;
      const { Harness } = require('../../credit-service/e2e/harness.ts');
      harness = new Harness();
      await harness.start();
      // Hold both sockets until allocation completes so the ports are distinct.
      const sockets = [net.createServer(), net.createServer()];
      await Promise.all(sockets.map((socket) => new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve))));
      const [port, creditPort] = sockets.map((socket) => socket.address().port);
      await Promise.all(sockets.map((socket) => new Promise((resolve) => socket.close(resolve))));
      const base = `http://127.0.0.1:${port}`;
      const credit = launch(path.resolve(__dirname, '../../credit-service'), {
        DATABASE_URL: process.env.E2E_DATABASE_URL, KAFKA_BROKERS: brokers,
        USER_SERVICE_BASE_URL: base, PORT: String(creditPort),
      });
      const userEnv = {
        DATABASE_URL: userDb.pool.options.connectionString, PORT: String(port),
        BOOTSTRAP_ADMIN_USERNAME: 'status_admin', BOOTSTRAP_ADMIN_EMAIL: 'status_admin@u.nus.edu',
        BOOTSTRAP_ADMIN_PASSWORD: 'StrongPassword123',
      };
      let user = launch(path.resolve(__dirname, '..'), { ...userEnv, KAFKA_BROKERS: '127.0.0.1:1' });
      async function ready() {
        await waitFor(async () => {
          if (user.exitCode !== null) throw new Error(`User Service exited: ${logs}`);
          if (credit.exitCode !== null) throw new Error(`Credit Service exited: ${logs}`);
          return fetch(`${base}/health`).then((res) => res.ok).catch(() => false);
        }, 15_000);
      }
      await ready();
      const registration = await fetch(`${base}/auth/register`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'status_member', email: 'status_member@u.nus.edu', password: 'StrongPassword123' }),
      });
      assert.equal(registration.status, 201);
      const member = await registration.json();
      assert.equal((await userDb.pool.query('SELECT * FROM outbox WHERE published_at IS NULL')).rowCount, 2);
      await stop(user);
      user = launch(path.resolve(__dirname, '..'), { ...userEnv, KAFKA_BROKERS: brokers });
      await ready();
      await harness.waitForBalance(member.id, { available: 100, reserved: 0, status: 'ACTIVE' });
      const initial = (await userDb.pool.query(
        "SELECT payload FROM outbox WHERE message_key=$1 AND payload->>'first_active'='true'", [member.id],
      )).rows[0].payload;
      await harness.send('user.account-status', member.id, initial);
      await harness.grantedAccount(); // Same-topic progress barrier proves the replay was handled.
      assert.deepEqual(await harness.balance(member.id), { available: 100, reserved: 0, status: 'ACTIVE' });
      const firstReserve = await harness.reserve(member.id, 10);
      assert.equal((await harness.reply(firstReserve.operation_id)).body.type, 'CreditReserved');
      const login = await fetch(`${base}/auth/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identifier: 'status_admin', password: 'StrongPassword123' }),
      });
      assert.equal(login.status, 200);
      const token = (await login.json()).accessToken;
      async function change(action) {
        const res = await fetch(`${base}/users/${member.id}/${action}`, {
          method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ reason: 'account-status end-to-end test' }),
        });
        assert.equal(res.status, 200);
        await harness.waitForBalance(member.id, { status: action === 'suspend' ? 'SUSPENDED' : 'ACTIVE' });
      }
      await change('suspend');
      const blocked = await harness.reserve(member.id, 1);
      assert.equal((await harness.reply(blocked.operation_id)).body.reason_code, 'ACCOUNT_NOT_ACTIVE');
      await change('restore');
      const restored = (await userDb.pool.query(
        "SELECT payload FROM outbox WHERE message_key = $1 AND payload->>'first_active' = 'false' AND payload->>'new_status' = 'ACTIVE'", [member.id],
      )).rows[0].payload;
      const accepted = await harness.reserve(member.id, 1);
      assert.equal((await harness.reply(accepted.operation_id)).body.type, 'CreditReserved');
      await change('suspend');
      await harness.send('user.account-status', member.id, restored);
      // A later account-status marker proves the replay has been consumed before the reserve.
      await harness.grantedAccount();
      const stillBlocked = await harness.reserve(member.id, 1);
      assert.equal((await harness.reply(stillBlocked.operation_id)).body.reason_code, 'ACCOUNT_NOT_ACTIVE');
      assert.deepEqual(await harness.balance(member.id), { available: 89, reserved: 11, status: 'SUSPENDED' });
      assert.equal((await harness.pool.query(
        "SELECT count(*)::int AS n FROM credit_transactions WHERE user_id=$1 AND type='INITIAL_GRANT'", [member.id],
      )).rows[0].n, 1);
      await waitFor(async () => (await userDb.pool.query('SELECT * FROM outbox WHERE published_at IS NULL')).rowCount === 0);
    } catch (err) {
      console.error(logs);
      throw err;
    } finally {
      for (const child of children) await stop(child);
      await harness?.stop();
      if (creditDb) await creditDb.drop();
      await userDb.pool.end();
      await userDb.drop();
    }
  });
