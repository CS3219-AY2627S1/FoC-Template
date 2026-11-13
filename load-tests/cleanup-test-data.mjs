// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-31
// Scope: Generated initial implementation of the load-test data cleanup script.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import { readFile } from 'node:fs/promises'

const baseUrl = (process.env.BASE_URL ?? 'http://localhost:8080').replace(/\/$/, '')
const envPath = process.env.LOAD_TEST_ENV_FILE ?? 'load-tests/.env.generated'

function parseEnv(content) {
  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        return [line.slice(0, separator), line.slice(separator + 1)]
      }),
  )
}

async function request(url, init = {}) {
  const response = await fetch(url, init)
  const text = await response.text()
  let body
  try {
    body = text ? JSON.parse(text) : undefined
  } catch {
    body = text
  }
  return { response, body }
}

function cookieHeader(response) {
  const cookies = response.headers.getSetCookie?.() ?? []
  const values = cookies
    .map((cookie) => cookie.split(';', 1)[0])
    .filter((cookie) => cookie.startsWith('relay_access=') || cookie.startsWith('relay_id='))
  if (values.length !== 2) throw new Error('Cleanup login did not return the required session cookies.')
  return values.join('; ')
}

async function main() {
  if (process.env.LOAD_TEST_CLEANUP === 'false') {
    console.log('Load-test cleanup disabled.')
    return
  }

  let values
  try {
    values = parseEnv(await readFile(envPath, 'utf8'))
  } catch {
    console.log(`No generated environment found at ${envPath}; nothing to clean up.`)
    return
  }

  const errandId = values.LOAD_TEST_ERRAND_ID
  if (!errandId) {
    console.log('No fixture errand ID found; nothing to clean up.')
    return
  }

  const login = await request(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: values.LOAD_TEST_REQUESTER_EMAIL,
      password: values.LOAD_TEST_REQUESTER_PASSWORD,
    }),
  })
  if (login.response.status !== 200) {
    throw new Error(`Cleanup login failed with HTTP ${login.response.status}.`)
  }
  const cookie = cookieHeader(login.response)
  const headers = { Cookie: cookie }

  const cancel = await request(`${baseUrl}/api/errands/${encodeURIComponent(errandId)}/cancel`, {
    method: 'POST',
    headers,
  })
  if (cancel.response.status !== 200 && cancel.response.status !== 404) {
    throw new Error(`Cancel fixture errand failed with HTTP ${cancel.response.status}.`)
  }

  const deleted = await request(`${baseUrl}/api/errands/${encodeURIComponent(errandId)}`, {
    method: 'DELETE',
    headers,
  })
  if (deleted.response.status !== 204 && deleted.response.status !== 404) {
    throw new Error(`Delete fixture errand failed with HTTP ${deleted.response.status}.`)
  }

  console.log(`Cleaned up fixture errand ${errandId}.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
