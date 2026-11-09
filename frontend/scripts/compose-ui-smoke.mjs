/* Additional AI assistance: OpenAI Codex (GPT-6), 2026-11-09.
 * Scope: Avoid a fixed Credit HTTP port in disposable UI stacks for #58. Author review: Pending. */
/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-27.
 * Scope: Added disposable Compose orchestration for the real-browser Supplier
 * UI verification in issue #31.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-10-18.
 * Scope: Supplied the disposable User database credentials and audit key now
 * required by the current Compose stack, and retained failure diagnostics for
 * the issue #42 CI artifact.
 * Author review: Pending project-author review.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), 2026-10-18.
 * Scope: Supplied the disposable Credit database credentials now required by
 * the Compose stack.
 * Author review: Reviewed and approved by @phuc project-author review.
 */
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(frontendDirectory, '..')
const diagnosticsDirectory = resolve(frontendDirectory, 'test-results', 'compose-diagnostics')
const projectName = `foc-supplier-ui-${process.pid}-${randomUUID().slice(0, 8)}`
const [frontendPort, userPort, supplierPort] = await reserveAvailablePorts(3)
const frontendBaseUrl = `http://127.0.0.1:${frontendPort}`
const adminUsername = 'supplier_ui_admin'
const adminPassword = 'SupplierUiAdmin1'
const memberUsername = 'supplier_ui_member'
const memberPassword = 'SupplierUiMember1'

const environment = {
  ...process.env,
  AUDIT_HMAC_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  CREDIT_DB_ADMIN_PASSWORD: 'supplier-ui-credit-admin-password',
  CREDIT_DB_APP_PASSWORD: 'supplier-ui-credit-runtime-password',
  CREDIT_DB_MIGRATION_PASSWORD: 'supplier-ui-credit-migration-password',
  JWT_SECRET: 'supplier-ui-smoke-only-jwt-secret-32-characters',
  SUPPLIER_DB_ADMIN_PASSWORD: 'supplier-ui-smoke-admin-password',
  SUPPLIER_DB_MIGRATION_PASSWORD: 'supplier-ui-smoke-migration-password',
  SUPPLIER_DB_PASSWORD: 'supplier-ui-smoke-runtime-password',
  USER_DB_ADMIN_PASSWORD: 'supplier-ui-user-admin-password',
  USER_DB_APP_PASSWORD: 'supplier-ui-user-runtime-password',
  USER_DB_MIGRATION_PASSWORD: 'supplier-ui-user-migration-password',
  ORDER_DB_ADMIN_PASSWORD: 'supplier-ui-order-admin-password',
  ORDER_DB_MIGRATION_PASSWORD: 'supplier-ui-order-migration-password',
  ORDER_DB_APP_PASSWORD: 'supplier-ui-order-runtime-password',
  ALLOWED_EMAIL_DOMAIN: 'u.nus.edu',
  BOOTSTRAP_ADMIN_USERNAME: adminUsername,
  BOOTSTRAP_ADMIN_EMAIL: 'supplier-ui-admin@u.nus.edu',
  BOOTSTRAP_ADMIN_PASSWORD: adminPassword,
  FRONTEND_PORT: String(frontendPort),
  CREDIT_PORT: '0',
  USER_PORT: String(userPort),
  SUPPLIER_PORT: String(supplierPort),
  SUPPLIER_UI_BASE_URL: frontendBaseUrl,
  SUPPLIER_UI_ADMIN_USERNAME: adminUsername,
  SUPPLIER_UI_ADMIN_PASSWORD: adminPassword,
  SUPPLIER_UI_MEMBER_USERNAME: memberUsername,
  SUPPLIER_UI_MEMBER_EMAIL: 'supplier-ui-member@u.nus.edu',
  SUPPLIER_UI_MEMBER_PASSWORD: memberPassword,
}

try {
  run('docker', ['info'], { capture: true })
  compose(['up', '--build', '--detach'])

  await Promise.all([
    waitFor(`http://127.0.0.1:${userPort}/health`, 'User Service'),
    waitFor(`http://127.0.0.1:${supplierPort}/health`, 'Supplier Service'),
    waitFor(frontendBaseUrl, 'frontend gateway'),
  ])

  console.log(`\nRunning the real-browser Supplier UI journey at ${frontendBaseUrl}...`)
  run(localPlaywright(), ['test'], { cwd: frontendDirectory })
  console.log('\nPASS: live member/admin Supplier UI journeys and responsive overflow checks completed.')
} catch (error) {
  retainFailureDiagnostics(error)
  throw error
} finally {
  console.log(`\nRemoving disposable Compose project ${projectName} and its volumes...`)
  try { compose(['down', '--volumes', '--remove-orphans'], { capture: true }) } catch (cleanupError) {
    console.error('Warning: automatic cleanup failed. Run:')
    console.error(`docker compose --project-name ${projectName} down --volumes --remove-orphans`)
    console.error(cleanupError)
  }
}

function compose(args, options = {}) {
  return run('docker', ['compose', '--project-name', projectName, ...args], {
    ...options,
    cwd: repositoryRoot,
  })
}

function retainFailureDiagnostics(originalError) {
  mkdirSync(diagnosticsDirectory, { recursive: true })
  writeFileSync(
    resolve(diagnosticsDirectory, 'failure.txt'),
    `${formatError(originalError)}\n`,
  )
  retainComposeOutput('Disposable stack status', ['ps'], 'compose-status.txt')
  retainComposeOutput(
    'Relevant service logs',
    ['logs', '--no-color', '--tail', '120', 'frontend', 'user-service', 'supplier-service'],
    'compose-logs.txt',
  )
}

function retainComposeOutput(label, args, filename) {
  let output
  try {
    output = compose(args, { capture: true }) || `${label}: no output was available.\n`
  } catch (diagnosticError) {
    output = `Could not collect ${label.toLowerCase()}.\n${formatError(diagnosticError)}\n`
  }
  console.error(`\n${label}:\n${output}`)
  writeFileSync(resolve(diagnosticsDirectory, filename), output)
}

function formatError(error) {
  return error instanceof Error ? (error.stack || error.message) : String(error)
}

function run(command, args, { capture = false, cwd = repositoryRoot } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: environment,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const detail = capture ? `\n${result.stderr || result.stdout}` : ''
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status}.${detail}`)
  }
  return result.stdout
}

async function waitFor(url, description) {
  let lastFailure
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastFailure = new Error(`${description} returned ${response.status}`)
    } catch (error) {
      lastFailure = error
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500))
  }
  throw new Error(`${description} did not become ready at ${url}`, { cause: lastFailure })
}

async function reserveAvailablePorts(count) {
  const servers = await Promise.all(Array.from({ length: count }, () => listenOnAvailablePort()))
  const ports = servers.map(({ port }) => port)
  await Promise.all(servers.map(({ server }) => new Promise((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose())
  })))
  return ports
}

function listenOnAvailablePort() {
  return new Promise((resolveListen, rejectListen) => {
    const server = createServer()
    server.unref()
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        rejectListen(new Error('Could not reserve an available TCP port.'))
        return
      }
      resolveListen({ server, port: address.port })
    })
  })
}

function localPlaywright() {
  const executable = process.platform === 'win32' ? 'playwright.cmd' : 'playwright'
  return resolve(frontendDirectory, 'node_modules', '.bin', executable)
}
