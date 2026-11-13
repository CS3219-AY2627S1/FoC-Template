import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const loadTestsDirectory = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.dirname(loadTestsDirectory)

function option(name, fallback) {
  const index = process.argv.indexOf(name)
  if (index === -1) return fallback
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`)
  return value
}

function resolveFromRepo(value) {
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value)
}

function run(command, args, { capture = false, allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: capture ? 'utf8' : undefined,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    windowsHide: true,
  })

  if (result.error) throw result.error
  const exitCode = result.status ?? 1
  if (!allowFailure && exitCode !== 0) {
    const details = capture ? `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() : ''
    throw new Error(`${command} exited with code ${exitCode}${details ? `:\n${details}` : '.'}`)
  }
  return capture ? { exitCode, stdout: result.stdout.trim() } : { exitCode }
}

function parseEnvFile(contents) {
  const values = new Map()
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 1) continue
    values.set(line.slice(0, separator), line.slice(separator + 1))
  }
  return values
}

function requiredEnv(values, name, envFile) {
  const value = values.get(name)
  if (!value) {
    throw new Error(`${name} is missing from ${envFile}. Re-run the local provisioner.`)
  }
  return value
}

async function verifyCredentials(values, envFile) {
  const accounts = [
    {
      label: 'requester',
      email: requiredEnv(values, 'LOAD_TEST_REQUESTER_EMAIL', envFile),
      password: requiredEnv(values, 'LOAD_TEST_REQUESTER_PASSWORD', envFile),
    },
    {
      label: 'courier A',
      email: requiredEnv(values, 'LOAD_TEST_COURIER_EMAIL', envFile),
      password: requiredEnv(values, 'LOAD_TEST_COURIER_PASSWORD', envFile),
    },
    {
      label: 'courier B',
      email: requiredEnv(values, 'LOAD_TEST_COURIER_B_EMAIL', envFile),
      password: requiredEnv(values, 'LOAD_TEST_COURIER_B_PASSWORD', envFile),
    },
  ]

  for (const account of accounts) {
    const response = await fetch('http://localhost:8080/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: account.email, password: account.password }),
    })
    if (!response.ok) {
      throw new Error(
        `${account.label} credentials returned HTTP ${response.status}. ` +
          'Re-run node load-tests/provision-test-data.mjs before this suite.',
      )
    }
  }
}

function mockServerSource() {
  return `
const http = require('node:http')
const estimate = JSON.stringify({
  minCredits: 15,
  maxCredits: 20,
  reason: 'A prepared item is a straightforward collection and delivery.',
})
const response = JSON.stringify({ choices: [{ message: { content: estimate } }] })
http.createServer((request, result) => {
  request.resume()
  if (request.url === '/healthz') {
    result.writeHead(200, { 'content-type': 'text/plain' })
    result.end('ok')
    return
  }
  if (request.url === '/v1/chat/completions') {
    result.writeHead(200, {
      'content-type': 'application/json',
      'x-relay-load-test-mock': 'true',
    })
    result.end(response)
    return
  }
  result.writeHead(404)
  result.end()
}).listen(8080, '0.0.0.0')
`.trim()
}

function composeOverride() {
  return {
    services: {
      'credit-estimation-api': {
        environment: {
          AI_PROVIDER: 'openai',
          AI_API_KEY: 'load-test-only',
          AI_MODEL: 'load-test-mock',
          AI_ENDPOINT: 'http://credit-estimation-loadtest-ai:8080/v1/chat/completions',
          AI_ESTIMATION_TIMEOUT_MS: '3000',
          AI_RATE_LIMIT_REQUESTS_PER_MINUTE: '20',
          AI_GLOBAL_RATE_LIMIT_REQUESTS_PER_MINUTE: '300',
          REDIS_URL: 'redis://credit-estimation-loadtest-redis:6379',
        },
        depends_on: {
          'credit-estimation-loadtest-ai': { condition: 'service_healthy' },
          'credit-estimation-loadtest-redis': { condition: 'service_healthy' },
        },
      },
      'credit-estimation-loadtest-ai': {
        image: 'node:22-alpine',
        command: ['node', '-e', mockServerSource()],
        healthcheck: {
          test: [
            'CMD',
            'node',
            '-e',
            "fetch('http://127.0.0.1:8080/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))",
          ],
          interval: '2s',
          timeout: '2s',
          retries: 15,
        },
        deploy: { resources: { limits: { memory: '64M' } } },
      },
      'credit-estimation-loadtest-redis': {
        image: 'redis:7-alpine',
        command: ['redis-server', '--save', '', '--appendonly', 'no', '--maxmemory', '64mb'],
        healthcheck: {
          test: ['CMD', 'redis-cli', 'ping'],
          interval: '2s',
          timeout: '2s',
          retries: 15,
        },
        deploy: { resources: { limits: { memory: '96M' } } },
      },
    },
  }
}

function runK6(envFile, script, summary, overrides = {}) {
  const overrideArguments = Object.entries(overrides).flatMap(([name, value]) => [
    '-e',
    `${name}=${value}`,
  ])
  return run(
    'docker',
    [
      'run',
      '--rm',
      '-i',
      '--add-host',
      'host.docker.internal:host-gateway',
      '--env-file',
      envFile,
      '-e',
      `K6_SUMMARY_PATH=/scripts/results/${summary}`,
      ...overrideArguments,
      '-v',
      `${loadTestsDirectory}:/scripts`,
      'grafana/k6',
      'run',
      `/scripts/${script}`,
    ],
    { allowFailure: true },
  ).exitCode
}

const envFile = resolveFromRepo(option('--env-file', 'load-tests/.env.generated'))
const sustainedSummary = option(
  '--sustained-summary',
  'local-credit-estimation-sustained-summary.json',
)
const rateLimitSummary = option(
  '--rate-limit-summary',
  'local-credit-estimation-rate-limit-summary.json',
)
const sustainedDuration = option('--sustained-duration', null)
const baseComposeFile = path.join(repoRoot, 'compose.yaml')
const developmentEnvFile = path.join(repoRoot, '.env.development')
const projectEnvFile = path.join(repoRoot, '.env')
const generatedComposeEnvFile = path.join(repoRoot, 'floci', 'docker', '.generated.env')
const resultsDirectory = path.join(loadTestsDirectory, 'results')

if (!existsSync(envFile)) throw new Error(`Load-test environment not found: ${envFile}`)
if (!existsSync(generatedComposeEnvFile)) {
  throw new Error('Run npm run up:compose before this suite; its generated environment is missing.')
}

const composeEnvArguments = []
if (existsSync(projectEnvFile)) composeEnvArguments.push('--env-file', projectEnvFile)
composeEnvArguments.push('--env-file', developmentEnvFile)
composeEnvArguments.push('--env-file', generatedComposeEnvFile)
const baseComposeArguments = [
  'compose',
  ...composeEnvArguments,
  '--project-directory',
  repoRoot,
  '-f',
  baseComposeFile,
]

run('docker', ['info', '--format', '{{.ServerVersion}}'], { capture: true })
const hostContainers = run(
  'docker',
  [...baseComposeArguments, 'ps', '--status', 'running', '-q', 'host'],
  {
    capture: true,
  },
)
  .stdout.split(/\r?\n/)
  .filter(Boolean)
if (hostContainers.length !== 1) {
  throw new Error('The local Relay stack is not running. Run npm run up:compose first.')
}

console.log('Checking generated test credentials...')
const generatedValues = parseEnvFile(await readFile(envFile, 'utf8'))
await verifyCredentials(generatedValues, envFile)

await mkdir(resultsDirectory, { recursive: true })
const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'relay-credit-estimation-'))
const testComposeFile = path.join(temporaryDirectory, 'compose.json')
await writeFile(testComposeFile, JSON.stringify(composeOverride(), null, 2))
const testComposeArguments = [...baseComposeArguments, '-f', testComposeFile]
const testDependencies = ['credit-estimation-loadtest-ai', 'credit-estimation-loadtest-redis']
const failures = []
let testConfigurationStarted = false
let baseConfigurationRestored = false

try {
  run('docker', [...testComposeArguments, 'config', '--quiet'])
  testConfigurationStarted = true
  console.log('Starting isolated mock AI and Redis...')
  run('docker', [...testComposeArguments, 'up', '-d', '--wait', ...testDependencies])
  run('docker', [
    ...testComposeArguments,
    'up',
    '-d',
    '--wait',
    '--force-recreate',
    '--no-deps',
    '--scale',
    'credit-estimation-api=1',
    'credit-estimation-api',
  ])

  const estimatorContainers = run(
    'docker',
    [...testComposeArguments, 'ps', '--status', 'running', '-q', 'credit-estimation-api'],
    { capture: true },
  )
    .stdout.split(/\r?\n/)
    .filter(Boolean)
  if (estimatorContainers.length !== 1) {
    throw new Error(
      `Expected exactly one running credit-estimation-api container, found ${estimatorContainers.length}.`,
    )
  }

  console.log('Running sustained single-instance estimation load...')
  const sustainedExitCode = runK6(
    envFile,
    'nfr-credit-estimation.js',
    sustainedSummary,
    sustainedDuration ? { NFR_ESTIMATION_DURATION: sustainedDuration } : {},
  )
  if (sustainedExitCode !== 0) {
    failures.push(`Sustained load test failed with exit code ${sustainedExitCode}.`)
  }

  console.log('Resetting isolated limiter state before the boundary test...')
  run('docker', [...testComposeArguments, 'rm', '-s', '-f', 'credit-estimation-loadtest-redis'])
  run('docker', [...testComposeArguments, 'up', '-d', '--wait', 'credit-estimation-loadtest-redis'])
  run('docker', [
    ...testComposeArguments,
    'up',
    '-d',
    '--wait',
    '--force-recreate',
    '--no-deps',
    '--scale',
    'credit-estimation-api=1',
    'credit-estimation-api',
  ])

  console.log('Running exact per-user rate-limit boundary test...')
  const rateLimitExitCode = runK6(envFile, 'credit-estimation-rate-limit.js', rateLimitSummary)
  if (rateLimitExitCode !== 0) {
    failures.push(`Rate-limit boundary test failed with exit code ${rateLimitExitCode}.`)
  }
} catch (error) {
  failures.push(`Single-instance test harness failed: ${error.message}`)
} finally {
  if (testConfigurationStarted) {
    console.log('Restoring the normal local credit-estimation service...')
    try {
      run('docker', [
        ...baseComposeArguments,
        'up',
        '-d',
        '--wait',
        '--force-recreate',
        '--no-deps',
        '--scale',
        'credit-estimation-api=1',
        'credit-estimation-api',
      ])
      baseConfigurationRestored = true
    } catch (error) {
      failures.push(`Could not restore the normal estimator configuration: ${error.message}`)
    }

    if (baseConfigurationRestored) {
      try {
        run('docker', [...testComposeArguments, 'rm', '-s', '-f', ...testDependencies])
      } catch (error) {
        failures.push(`Could not remove load-test dependencies: ${error.message}`)
      }
    } else {
      console.warn(
        `Mock AI and Redis were retained because restoration failed. Compose override: ${testComposeFile}`,
      )
    }
  }

  if (baseConfigurationRestored || !testConfigurationStarted) {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

if (failures.length > 0) throw new Error(failures.join('\n'))

console.log('Single-instance credit estimation suite passed.')
console.log(`Sustained summary: ${path.join(resultsDirectory, sustainedSummary)}`)
console.log(`Rate-limit summary: ${path.join(resultsDirectory, rateLimitSummary)}`)
