// AI assistance: OpenAI Codex, 2026-11-09. Scope: approved isolated messaging CI runners and evidence. Review: Reviewed and approved by @ron on 2026-11-09.
// Additional AI assistance: OpenAI Codex, 2026-11-10. Scope: isolate Credit's newly merged HTTP port (#62). Review: pending for this compatibility follow-up.
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtempSync, writeFileSync, readFileSync, appendFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { verifyReport, redact, sanitizeDirectory } from './evidence.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const mode = process.argv[2];
const boundaries = { order: 'Kafka integration', credit: 'reserve (credit.commands', user: 'HTTP registration survives', journey: 'actual Order and Credit' };
if (!boundaries[mode]) throw new Error('Usage: node scripts/ci/messaging.mjs order|credit|user|journey');
const artifacts = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), `foc-ci-${mode}-`));
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `artifacts=${artifacts}\n`);
console.log(`Messaging evidence: ${artifacts}`);
const project = `foc-ci-${mode}-${randomUUID().slice(0, 12)}`;
const env = { ...process.env, CI_ARTIFACT_DIR: artifacts, CI_COMPOSE_PROJECT: project };
const secrets = ['e2eadmin', 'e2emigrator', 'e2eapp', 'StrongPassword123', 'test-only-secret', 'ab'.repeat(32)];
env.CI_REDACT_SECRETS_JSON = JSON.stringify(secrets);
let active;
let composeArgs;
let started = false;
const allocatedPorts = new Set();

function interrupt(signal) {
  if (!active) return;
  try { process.kill(-active.pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; }
}
process.on('SIGTERM', () => interrupt('SIGTERM'));
process.on('SIGINT', () => interrupt('SIGINT'));

async function run(command, args, options = {}) {
  console.log(`Running ${command} ${args.filter(arg => !arg.includes('postgres://')).join(' ')}`);
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: root, env, detached: true, ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    active = child;
    for (const stream of [child.stdout, child.stderr]) {
      createInterface({ input: stream }).on('line', line => {
        const safe = redact(line, secrets);
        console.log(safe);
        appendFileSync(join(artifacts, 'commands.log'), `${safe}\n`);
      });
    }
    const timer = setTimeout(() => {
      interrupt('SIGTERM');
      setTimeout(() => { if (active === child) interrupt('SIGKILL'); }, 5000).unref();
    }, options.timeout || 12 * 60_000);
    child.on('error', error => { clearTimeout(timer); active = undefined; reject(error); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      active = undefined;
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} failed: ${code ?? signal}`));
    });
  });
}

async function freePort() {
  const server = createServer();
  await new Promise(resolvePromise => server.listen(0, '127.0.0.1', resolvePromise));
  const port = server.address().port;
  await new Promise(resolvePromise => server.close(resolvePromise));
  if (allocatedPorts.has(port)) return freePort();
  allocatedPorts.add(port);
  return String(port);
}

const compose = args => run('docker', [...composeArgs, ...args]);
const mappedPort = service => execFileSync('docker', [...composeArgs, 'port', service, '5432'], { cwd: root, env, encoding: 'utf8' }).trim().split(':').at(-1);
const reporters = ['--test-reporter=spec', '--test-reporter-destination=stdout', '--test-reporter=junit', `--test-reporter-destination=${join(artifacts, 'tests.xml')}`];

try {
  if (mode === 'order') await run('bash', ['order-service/scripts/test-kafka.sh']);
  else if (mode === 'credit') {
    env.CI_COMPOSE_OVERRIDE = join(artifacts, 'credit-override.json');
    writeFileSync(env.CI_COMPOSE_OVERRIDE, JSON.stringify({ services: {
      'credit-service': { image: `${project}-runtime:test` },
      'credit-migrate': { image: `${project}-runtime:test` },
      e2e: { image: `${project}-tests:test` },
    } }));
    await run('bash', ['credit-service/e2e/run.sh']);
  }
  else {
    const port = await freePort();
    const override = {
      services: {
        kafka: {
          ports: [`127.0.0.1:${port}:19092`],
          environment: {
            KAFKA_LISTENERS: 'PLAINTEXT://:9092,CONTROLLER://:9093,HOST://:19092',
            KAFKA_ADVERTISED_LISTENERS: `PLAINTEXT://kafka:9092,HOST://127.0.0.1:${port}`,
            KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: 'PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT,HOST:PLAINTEXT',
          },
        },
        'credit-db': { ports: ['127.0.0.1::5432'] },
      },
    };
    env.KAFKA_BROKERS = `127.0.0.1:${port}`;
    const base = mode === 'user' ? 'credit-service/e2e/compose.yaml' : 'compose.yaml';
    const overridePath = join(artifacts, 'override.json');
    const emptyEnv = join(artifacts, 'empty.env');
    writeFileSync(emptyEnv, '');
    composeArgs = ['compose', '--project-name', project, '--env-file', emptyEnv, '-f', resolve(root, base), '-f', overridePath];
    if (mode === 'journey') {
      for (const prefix of ['USER', 'ORDER', 'CREDIT']) for (const role of ['ADMIN', 'APP', 'MIGRATION']) env[`${prefix}_DB_${role}_PASSWORD`] = 'ci-messaging-password';
      Object.assign(env, {
        SUPPLIER_DB_ADMIN_PASSWORD: 'ci-messaging-password', SUPPLIER_DB_MIGRATION_PASSWORD: 'ci-messaging-password', SUPPLIER_DB_PASSWORD: 'ci-messaging-password',
        JWT_SECRET: 'ci-messaging-test-only-jwt-secret-32-chars', AUDIT_HMAC_KEY: 'ab'.repeat(32), ALLOWED_EMAIL_DOMAIN: 'u.nus.edu',
        BOOTSTRAP_ADMIN_USERNAME: 'ci_admin', BOOTSTRAP_ADMIN_EMAIL: 'ci-admin@u.nus.edu', BOOTSTRAP_ADMIN_PASSWORD: 'CiMessagingPassword1',
        USER_PORT: `127.0.0.1:${await freePort()}`, SUPPLIER_PORT: `127.0.0.1:${await freePort()}`, ORDER_PORT: `127.0.0.1:${await freePort()}`,
        CREDIT_PORT: `127.0.0.1:${await freePort()}`,
      });
      secrets.push('ci-messaging-password', env.JWT_SECRET, env.AUDIT_HMAC_KEY, env.BOOTSTRAP_ADMIN_PASSWORD);
      env.CI_REDACT_SECRETS_JSON = JSON.stringify(secrets);
      override.services['order-db'] = { ports: ['127.0.0.1::5432'] };
      // Preserve developer image tags: every test image belongs only to this project.
      for (const [service, image] of Object.entries({ 'user-service': 'user', 'user-migrate': 'user', 'order-service': 'order', 'order-migrate': 'order', 'credit-service': 'credit', 'credit-migrate': 'credit', 'supplier-service': 'supplier', 'supplier-migrate': 'supplier' })) {
        override.services[service] = { image: `${project}-${image}:test` };
      }
    }
    writeFileSync(overridePath, JSON.stringify(override));
    started = true;
    if (mode === 'user') {
      await compose(['up', '--detach', '--wait', 'kafka', 'credit-db']);
      await compose(['run', '--rm', '--no-deps', 'kafka-init']);
      env.TEST_DATABASE_URL = `postgres://credit_bootstrap:e2eadmin@127.0.0.1:${mappedPort('credit-db')}/credits`;
      await run('node', ['--import', 'tsx', '--test', ...reporters, 'e2e/account-status.test.cjs'], { cwd: join(root, 'user-service') });
    } else {
      await compose(['up', '--build', '--detach', '--wait', 'user-service', 'supplier-service', 'order-service', 'credit-service']);
      env.USER_API = `http://${env.USER_PORT}`;
      env.SUPPLIER_API = `http://${env.SUPPLIER_PORT}`;
      env.ORDER_API = `http://${env.ORDER_PORT}`;
      env.ORDER_DATABASE_URL = `postgres://order_bootstrap:ci-messaging-password@127.0.0.1:${mappedPort('order-db')}/orders`;
      env.CREDIT_DATABASE_URL = `postgres://credit_bootstrap:ci-messaging-password@127.0.0.1:${mappedPort('credit-db')}/credits`;
      await run('node', ['--test', ...reporters, 'scripts/ci/order-credit.test.mjs']);
    }
  }
  const count = verifyReport(readFileSync(join(artifacts, 'tests.xml'), 'utf8'), boundaries[mode]);
  console.log(`PASS: ${mode} messaging: ${count} executed cases, no skips.`);
} catch (error) {
  process.exitCode = 1;
  console.error(redact(error.stack || String(error), secrets));
} finally {
  try { sanitizeDirectory(artifacts, secrets); }
  catch (error) { process.exitCode = 1; console.error(`Report sanitization failed: ${redact(String(error), secrets)}`); }
  if (started) {
    try {
      const log = execFileSync('docker', [...composeArgs, 'logs', '--no-color', '--tail', '300'], { cwd: root, env, encoding: 'utf8', timeout: 30_000, maxBuffer: 16 * 1024 * 1024 });
      writeFileSync(join(artifacts, 'compose.log'), redact(log, secrets));
    } catch (error) { process.exitCode = 1; console.error(`Cleanup/evidence failure: ${redact(String(error), secrets)}`); }
    finally {
      try { await compose(['down', '--volumes', '--remove-orphans', '--timeout', '3']); }
      catch (error) { process.exitCode = 1; console.error(`Cleanup failed: ${redact(String(error), secrets)}`); }
    }
  }
  if (mode === 'journey' || mode === 'credit') {
    try {
      const images = execFileSync('docker', ['image', 'ls', '--filter', `reference=${project}-*`, '--format', '{{.Repository}}:{{.Tag}}'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
      if (images.length) execFileSync('docker', ['image', 'rm', ...images], { timeout: 30_000 });
    } catch (error) { process.exitCode = 1; console.error(`Temporary image cleanup failed: ${redact(String(error), secrets)}`); }
  }
  for (const name of readdirSync(artifacts)) {
    const file = join(artifacts, name);
    if (name.endsWith('.log') || name.endsWith('.xml')) continue;
    else rmSync(file);
  }
}
