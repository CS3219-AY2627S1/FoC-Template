import assert from 'node:assert/strict'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, describe, it } from 'node:test'
import { UserServiceAuthorizer, sessionToken } from '../src/auth.ts'
import { createFakeUserService } from '../dev/fake-user-service.ts'

const cookie = (token: string) => `relay_session=${token}`

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, resolve))
  return `http://localhost:${(server.address() as AddressInfo).port}`
}

describe('sessionToken', () => {
  it('finds the session among other cookies', () => {
    assert.equal(sessionToken('relay_session=abc'), 'abc')
    assert.equal(sessionToken('theme=dark; relay_session=abc; lang=en'), 'abc')
    assert.equal(sessionToken('theme=dark;relay_session=abc'), 'abc')
  })

  it('is null when there is no session', () => {
    assert.equal(sessionToken(undefined), null)
    assert.equal(sessionToken(''), null)
    assert.equal(sessionToken('theme=dark; lang=en'), null)
    assert.equal(sessionToken('relay_session='), null)
    assert.equal(sessionToken('relay_session'), null)
  })

  it('does not mistake a cookie whose name only contains the session name', () => {
    assert.equal(sessionToken('my_relay_session=abc'), null)
    assert.equal(sessionToken('relay_session_old=abc'), null)
  })

  it('keeps a value that itself contains an equals sign', () => {
    assert.equal(sessionToken('relay_session=a=b'), 'a=b')
  })
})

describe('UserServiceAuthorizer against the fake user-service', () => {
  const server = createFakeUserService()
  let authorizer: UserServiceAuthorizer

  before(async () => {
    authorizer = new UserServiceAuthorizer(await listen(server))
  })
  after(() => server.close())

  it('treats a request without a session as unauthenticated, without asking', async () => {
    assert.deepEqual(await authorizer.authorize(undefined, 'supplier.read'), { kind: 'unauthenticated' })
    assert.deepEqual(await authorizer.authorize('theme=dark', 'supplier.read'), { kind: 'unauthenticated' })
  })

  it('refuses a session the user-service does not know', async () => {
    assert.deepEqual(await authorizer.authorize(cookie('nobody'), 'supplier.read'), { kind: 'denied' })
  })

  it('lets a member read and returns who they are', async () => {
    assert.deepEqual(await authorizer.authorize(cookie('member-token'), 'supplier.read'), {
      kind: 'authorized',
      accountId: 'member-account-1',
    })
  })

  it('refuses a member every operation that changes a supplier', async () => {
    for (const operation of ['supplier.create', 'supplier.update', 'supplier.deactivate'] as const) {
      assert.deepEqual(await authorizer.authorize(cookie('member-token'), operation), { kind: 'denied' })
    }
  })

  it('lets an administrator do all of them', async () => {
    for (const operation of [
      'supplier.read',
      'supplier.create',
      'supplier.update',
      'supplier.deactivate',
    ] as const) {
      assert.equal((await authorizer.authorize(cookie('admin-token'), operation)).kind, 'authorized')
    }
  })

  it('refuses an account that is not active, even for reads', async () => {
    assert.deepEqual(await authorizer.authorize(cookie('suspended-token'), 'supplier.read'), { kind: 'denied' })
  })

  it('finds the session among other cookies', async () => {
    const decision = await authorizer.authorize(`theme=dark; ${cookie('admin-token')}; lang=en`, 'supplier.create')
    assert.equal(decision.kind, 'authorized')
  })
})

describe('what the authorizer sends to the user-service', () => {
  const seen: { method?: string; url?: string; type?: string; cookie?: string; authorization?: string; body: unknown }[] = []
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      seen.push({
        method: request.method,
        url: request.url,
        type: request.headers['content-type'],
        cookie: request.headers.cookie,
        authorization: request.headers.authorization,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
      })
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ decision: 'authorized', accountId: 'a1', roles: ['member'] }))
    })
  })
  let authorizer: UserServiceAuthorizer

  before(async () => {
    authorizer = new UserServiceAuthorizer(await listen(server))
  })
  after(() => server.close())

  it('posts the token and the role to /internal/authorize as JSON', async () => {
    seen.length = 0
    await authorizer.authorize('relay_session=tok123', 'supplier.read')
    assert.equal(seen.length, 1)
    assert.equal(seen[0]!.method, 'POST')
    assert.equal(seen[0]!.url, '/internal/authorize')
    assert.match(seen[0]!.type ?? '', /^application\/json/)
    assert.deepEqual(seen[0]!.body, { token: 'tok123', requiredRole: 'member' })
  })

  it('asks for the administrator role for every operation that changes a supplier', async () => {
    seen.length = 0
    for (const operation of ['supplier.create', 'supplier.update', 'supplier.deactivate'] as const) {
      await authorizer.authorize('relay_session=tok123', operation)
    }
    assert.deepEqual(
      seen.map((s) => s.body),
      Array(3).fill({ token: 'tok123', requiredRole: 'administrator' }),
    )
  })

  it('passes on the session token only, never the caller\'s other cookies', async () => {
    seen.length = 0
    await authorizer.authorize('tracking=abc; relay_session=tok123; theme=dark', 'supplier.read')
    assert.equal(seen[0]!.cookie, undefined)
    assert.equal(seen[0]!.authorization, undefined)
    assert.deepEqual(seen[0]!.body, { token: 'tok123', requiredRole: 'member' })
  })
})

describe('UserServiceAuthorizer when the user-service misbehaves', () => {
  const refusedAsUnavailable = { kind: 'denied', unavailable: true }

  const answering = async (handler: (response: ServerResponse) => void) => {
    const server = createServer((request, response) => {
      request.resume()
      request.on('end', () => handler(response))
    })
    return { server, authorizer: new UserServiceAuthorizer(await listen(server)) }
  }

  it('refuses when nothing is listening', async () => {
    const closed = createServer()
    const url = await listen(closed)
    await new Promise((resolve) => closed.close(resolve))
    const decision = await new UserServiceAuthorizer(url).authorize(cookie('member-token'), 'supplier.read')
    assert.deepEqual(decision, refusedAsUnavailable)
  })

  it('refuses on an error status', async () => {
    const { server, authorizer } = await answering((r) => r.writeHead(500).end())
    try {
      assert.deepEqual(await authorizer.authorize(cookie('member-token'), 'supplier.read'), refusedAsUnavailable)
    } finally {
      server.close()
    }
  })

  it('refuses on an answer it cannot read', async () => {
    for (const body of ['{}', 'not json', '{"decision":"maybe"}', '{"decision":"authorized"}', '{"decision":"authorized","accountId":""}']) {
      const { server, authorizer } = await answering((r) => r.writeHead(200).end(body))
      try {
        assert.deepEqual(await authorizer.authorize(cookie('member-token'), 'supplier.read'), refusedAsUnavailable, body)
      } finally {
        server.close()
      }
    }
  })

  it('refuses, without calling it unavailable, when the user-service says denied', async () => {
    const { server, authorizer } = await answering((r) => r.writeHead(200).end('{"decision":"denied"}'))
    try {
      assert.deepEqual(await authorizer.authorize(cookie('member-token'), 'supplier.read'), { kind: 'denied' })
    } finally {
      server.close()
    }
  })

  it('refuses when the user-service does not answer within about two seconds', async () => {
    const { server, authorizer } = await answering(() => {})
    const started = Date.now()
    try {
      assert.deepEqual(await authorizer.authorize(cookie('member-token'), 'supplier.read'), refusedAsUnavailable)
      const took = Date.now() - started
      assert.ok(took >= 1900 && took < 4000, `gave up after ${took} ms`)
    } finally {
      server.closeAllConnections()
      server.close()
    }
  })
})
