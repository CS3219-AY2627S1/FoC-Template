// A fake of the user-service's authorization endpoint, for the automated tests.
// It answers POST /internal/authorize in the shape documented in
// user-service/README.md, with three fixed sessions. The running system and the
// demo use the real user-service. This file is never part of the container image.
import { createServer, type Server } from 'node:http'

interface Session {
  accountId: string
  active: boolean
  roles: string[]
}

// The token is what the relay_session cookie would carry. The suspended one is a
// session of an account that is no longer Active.
export const SESSIONS: Record<string, Session> = {
  'member-token': { accountId: 'member-account-1', active: true, roles: ['member'] },
  // A second student, so that tests can show one account never sees another's data.
  'other-member-token': { accountId: 'member-account-3', active: true, roles: ['member'] },
  'admin-token': {
    accountId: 'admin-account-1',
    active: true,
    roles: ['member', 'administrator'],
  },
  'suspended-token': { accountId: 'member-account-2', active: false, roles: ['member'] },
}

export function createFakeUserService(log: (line: string) => void = () => {}): Server {
  const sessions = new Map(Object.entries(SESSIONS))

  return createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      const send = (status: number, payload: object) => {
        response.writeHead(status, { 'content-type': 'application/json' })
        response.end(JSON.stringify(payload))
      }

      if (request.method !== 'POST' || request.url !== '/internal/authorize') {
        return send(404, { error: { code: 'NOT_FOUND', message: 'No such route' } })
      }

      let body: Record<string, unknown> = {}
      try {
        const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
        if (typeof parsed === 'object' && parsed !== null) body = parsed as Record<string, unknown>
      } catch {
        // An unreadable body is treated as an empty one, which fails validation.
      }

      // The real service rejects a body without a token, or with a role that is
      // neither member nor administrator.
      const requiredRole = body.requiredRole ?? 'member'
      if (typeof body.token !== 'string' || body.token === '' || (requiredRole !== 'member' && requiredRole !== 'administrator')) {
        log('authorize (invalid request) -> 400')
        return send(400, { error: { code: 'VALIDATION_FAILED', message: 'Invalid request' } })
      }

      const session = sessions.get(body.token)
      const decided = (decision: object, label: string) => {
        log(`authorize ${requiredRole} for ${label}`)
        send(200, decision)
      }
      if (!session || !session.active || !session.roles.includes(requiredRole)) {
        return decided({ decision: 'denied' }, `${session ? body.token : '(unknown session)'} -> denied`)
      }
      decided({ decision: 'authorized', accountId: session.accountId, roles: session.roles }, `${body.token} -> authorized`)
    })
  })
}

if (import.meta.main) {
  const port = Number(new URL(process.env.USER_SERVICE_URL || 'http://localhost:3001').port || 3001)
  createFakeUserService((line) => console.log(line)).listen(port, () => {
    console.log(`Fake user service on port ${port}. Sessions: ${Object.keys(SESSIONS).join(', ')}`)
  })
}
