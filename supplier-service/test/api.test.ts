import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { after, before, beforeEach, describe, it } from 'node:test'
import type { FastifyInstance } from 'fastify'
import { createFakeUserService } from '../dev/fake-user-service.ts'
import { buildApp } from '../src/app.ts'
import { UserServiceAuthorizer, type Authorizer } from '../src/auth.ts'
import { createPool, migrate, type Pool } from '../src/db.ts'
import { loadWalkMap } from '../src/map.ts'
import { seedPhotosOnce } from '../src/seed/photos.ts'
import { seedIfEmpty } from '../src/seed/seed.ts'

// These tests empty the suppliers table, so they only run against a database
// whose name ends in _test.
const databaseUrl = process.env.SUPPLIER_TEST_DATABASE_URL
const skip = databaseUrl ? false : 'set SUPPLIER_TEST_DATABASE_URL to run the API tests'
if (databaseUrl && !new URL(databaseUrl).pathname.endsWith('_test')) {
  throw new Error('SUPPLIER_TEST_DATABASE_URL must point at a database whose name ends in _test')
}

const SEED_FILE = path.join(import.meta.dirname, '../../data/csv/supplier-seed-data.csv')
const MIGRATIONS = path.join(import.meta.dirname, '../src/migrations')
const TIME_ZONE = 'Asia/Singapore'
// Thursday 12:00 in Singapore.
const NOW = new Date('2026-10-01T04:00:00Z')

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const DAILY = DAYS.map((day) => ({ day, opens: '09:00', closes: '18:00' }))

const cafe = (overrides: object = {}) => ({
  name: 'Test Cafe',
  type: 'Food',
  zone: 'Central',
  building: 'Central Library',
  address: 'Central Library, Level 1',
  latitude: 1.2964,
  longitude: 103.773,
  contact: { phone: '6516 1234', email: 'cafe@example.com' },
  hours: DAILY,
  ...overrides,
})

const silent = { info() {}, warn() {} }

// The service checks only the first bytes of an image, so a short buffer with the
// right start stands in for a real one.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 1)])
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(60, 2)])
const dataUrl = (type: string, bytes: Buffer) => `data:${type};base64,${bytes.toString('base64')}`
const photoBody = (photo = JPEG, thumbnail = PNG) => ({
  photo: dataUrl('image/jpeg', photo),
  thumbnail: dataUrl('image/png', thumbnail),
})

describe('supplier API', { skip }, () => {
  let pool: Pool
  let app: FastifyInstance
  let authorizer: Authorizer
  let userService: ReturnType<typeof createFakeUserService>

  before(async () => {
    pool = createPool(databaseUrl!, () => {})
    await migrate(pool, MIGRATIONS)
    userService = createFakeUserService()
    await new Promise<void>((resolve) => userService.listen(0, resolve))
    const port = (userService.address() as AddressInfo).port
    authorizer = new UserServiceAuthorizer(`http://localhost:${port}`)
    app = buildApp({ db: pool, authorizer, timeZone: TIME_ZONE, now: () => NOW, walkMap: (await loadWalkMap()).map })
    await app.ready()
  })

  after(async () => {
    await app.close()
    userService.close()
    await pool.end()
  })

  beforeEach(async () => {
    await pool.query('TRUNCATE suppliers, seed_runs CASCADE')
  })

  async function call(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, token?: string, payload?: object) {
    const response = await app.inject({
      method,
      url,
      headers: token ? { cookie: `relay_session=${token}` } : {},
      payload,
    })
    return {
      status: response.statusCode,
      headers: response.headers,
      body: response.body ? JSON.parse(response.body) : null,
    }
  }

  const create = async (overrides: object = {}) => {
    const response = await call('POST', '/suppliers', 'admin-token', cafe(overrides))
    assert.equal(response.status, 201, JSON.stringify(response.body))
    return response.body
  }

  const snapshot = async () =>
    (await pool.query('SELECT id, updated_at, status FROM suppliers ORDER BY id')).rows

  describe('access control', () => {
    it('answers 401 to every route when there is no session', async () => {
      const { id } = await create()
      for (const [method, url] of [
        ['GET', '/suppliers'],
        ['GET', '/suppliers/filters'],
        ['GET', `/suppliers/${id}`],
        ['GET', `/suppliers/${id}/availability`],
        ['GET', `/suppliers/${id}/photo`],
        ['GET', '/suppliers/favorites'],
        ['POST', `/suppliers/${id}/route`],
        ['PUT', `/suppliers/${id}/favorite`],
        ['DELETE', `/suppliers/${id}/favorite`],
        ['POST', '/suppliers'],
        ['PATCH', `/suppliers/${id}`],
        ['DELETE', `/suppliers/${id}`],
        ['PUT', `/suppliers/${id}/photo`],
        ['DELETE', `/suppliers/${id}/photo`],
      ] as const) {
        const response = await call(method, url, undefined, method === 'GET' ? undefined : {})
        assert.equal(response.status, 401, `${method} ${url}`)
        assert.equal(response.body.error.code, 'UNAUTHENTICATED')
      }
    })

    it('answers 403 to a session the User Service does not know', async () => {
      assert.equal((await call('GET', '/suppliers', 'forged-token')).status, 403)
    })

    it('answers 403 to an account that is not active, even for reads', async () => {
      const response = await call('GET', '/suppliers', 'suspended-token')
      assert.equal(response.status, 403)
      assert.equal(response.body.error.code, 'FORBIDDEN')
    })

    it('lets a member read but not change suppliers, and changes nothing', async () => {
      const { id } = await create()
      const before = await snapshot()

      assert.equal((await call('GET', '/suppliers', 'member-token')).status, 200)
      assert.equal((await call('GET', `/suppliers/${id}`, 'member-token')).status, 200)
      assert.equal((await call('POST', '/suppliers', 'member-token', cafe())).status, 403)
      assert.equal((await call('PATCH', `/suppliers/${id}`, 'member-token', { name: 'Hacked' })).status, 403)
      assert.equal((await call('DELETE', `/suppliers/${id}`, 'member-token')).status, 403)

      assert.deepEqual(await snapshot(), before)
    })

    it('does not reveal whether a supplier exists to a caller who may not touch it', async () => {
      const { id } = await create()
      const missing = '00000000-0000-4000-8000-000000000000'
      for (const target of [id, missing, 'not-a-uuid']) {
        const patch = await call('PATCH', `/suppliers/${target}`, 'member-token', { name: 'x' })
        const remove = await call('DELETE', `/suppliers/${target}`, 'member-token')
        assert.equal(patch.status, 403)
        assert.equal(remove.status, 403)
      }
    })

    it('refuses with 403 and changes nothing when the User Service cannot be asked', async () => {
      const down: Authorizer = {
        authorize: async () => ({ kind: 'denied', unavailable: true }),
      }
      const downApp = buildApp({ db: pool, authorizer: down, timeZone: TIME_ZONE, now: () => NOW })
      const response = await downApp.inject({ method: 'POST', url: '/suppliers', payload: cafe() })
      assert.equal(response.statusCode, 403)
      assert.equal((await snapshot()).length, 0)
    })
  })

  describe('create', () => {
    it('stores a supplier and returns it with an id and timestamps assigned by the service', async () => {
      const response = await call('POST', '/suppliers', 'admin-token', cafe())
      assert.equal(response.status, 201)
      assert.match(response.body.id, /^[0-9a-f-]{36}$/)
      assert.equal(response.headers.location, `/suppliers/${response.body.id}`)
      assert.equal(response.body.status, 'Active')
      assert.equal(response.body.createdAt, response.body.updatedAt)
      assert.deepEqual(response.body.contact, { phone: '6516 1234', email: 'cafe@example.com' })
      assert.equal(response.body.hours.length, 7)
      assert.equal('createdBy' in response.body, false)

      const stored = await call('GET', `/suppliers/${response.body.id}`, 'member-token')
      assert.equal(stored.status, 200)
      assert.equal(stored.body.name, 'Test Cafe')
    })

    it('records which administrator created it', async () => {
      const { id } = await create()
      const row = (await pool.query('SELECT created_by, updated_by FROM suppliers WHERE id = $1', [id])).rows[0]
      assert.deepEqual(row, { created_by: 'admin-account-1', updated_by: 'admin-account-1' })
    })

    it('names every invalid field and stores nothing', async () => {
      const response = await call('POST', '/suppliers', 'admin-token', {
        hours: [{ day: 'monday', opens: '25:00', closes: '18:00' }],
      })
      assert.equal(response.status, 400)
      assert.equal(response.body.error.code, 'VALIDATION_FAILED')
      const fields = response.body.error.fields.map((f: { field: string }) => f.field).sort()
      assert.deepEqual(fields, [
        'address',
        'building',
        'hours[0].opens',
        'name',
        'type',
        'zone',
      ])
      assert.equal((await snapshot()).length, 0)
    })

    it('answers 400 to a body that is not JSON', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/suppliers',
        headers: { cookie: 'relay_session=admin-token', 'content-type': 'application/json' },
        payload: '{oops',
      })
      assert.equal(response.statusCode, 400)
    })
  })

  describe('update', () => {
    it('changes the fields it is given, replaces the hours and sets the last-updated time', async () => {
      const created = await create()
      const response = await call('PATCH', `/suppliers/${created.id}`, 'admin-token', {
        name: 'Renamed Cafe',
        hours: [{ day: 'saturday', opens: '10:00', closes: '14:00' }],
      })
      assert.equal(response.status, 200)
      assert.equal(response.body.name, 'Renamed Cafe')
      assert.equal(response.body.type, 'Food')
      assert.deepEqual(response.body.hours, [{ day: 'saturday', opens: '10:00', closes: '14:00' }])
      assert.equal(response.body.createdAt, created.createdAt)
      assert.ok(response.body.updatedAt >= created.updatedAt)
    })

    it('clears an optional field', async () => {
      const created = await create()
      const response = await call('PATCH', `/suppliers/${created.id}`, 'admin-token', {
        contact: { phone: null },
      })
      assert.deepEqual(response.body.contact, { phone: null, email: 'cafe@example.com' })
    })

    it('refuses to change the identifier or creation time, naming both', async () => {
      const created = await create()
      const response = await call('PATCH', `/suppliers/${created.id}`, 'admin-token', {
        id: '00000000-0000-4000-8000-000000000000',
        createdAt: '2020-01-01T00:00:00Z',
      })
      assert.equal(response.status, 400)
      assert.deepEqual(
        response.body.error.fields.map((f: { field: string }) => f.field),
        ['id', 'createdAt'],
      )
    })

    it('answers 404 for a supplier that does not exist', async () => {
      const missing = '00000000-0000-4000-8000-000000000000'
      assert.equal((await call('PATCH', `/suppliers/${missing}`, 'admin-token', { name: 'x' })).status, 404)
    })

    it('applies two simultaneous updates one after the other', async () => {
      const { id } = await create()
      const [a, b] = await Promise.all([
        call('PATCH', `/suppliers/${id}`, 'admin-token', { name: 'First' }),
        call('PATCH', `/suppliers/${id}`, 'admin-token', { zone: 'Computing' }),
      ])
      assert.equal(a.status, 200)
      assert.equal(b.status, 200)
      const final = (await call('GET', `/suppliers/${id}`, 'member-token')).body
      assert.equal(final.name, 'First')
      assert.equal(final.zone, 'Computing')
    })
  })

  describe('deactivate', () => {
    it('sets the supplier Inactive and keeps the record retrievable', async () => {
      const { id } = await create()
      const response = await call('DELETE', `/suppliers/${id}`, 'admin-token')
      assert.equal(response.status, 200)
      assert.equal(response.body.status, 'Inactive')

      const stored = await call('GET', `/suppliers/${id}`, 'member-token')
      assert.equal(stored.status, 200)
      assert.equal(stored.body.status, 'Inactive')
    })

    it('leaves it out of listings unless asked, so no new errand is offered it', async () => {
      const { id } = await create()
      await call('DELETE', `/suppliers/${id}`, 'admin-token')

      assert.equal((await call('GET', '/suppliers', 'member-token')).body.total, 0)
      assert.equal((await call('GET', '/suppliers?status=Inactive', 'member-token')).body.total, 1)
      assert.equal((await call('GET', '/suppliers?status=all', 'member-token')).body.total, 1)
    })

    it('does nothing the second time', async () => {
      const { id } = await create()
      const first = await call('DELETE', `/suppliers/${id}`, 'admin-token')
      const second = await call('DELETE', `/suppliers/${id}`, 'admin-token')
      assert.equal(second.status, 200)
      assert.equal(second.body.updatedAt, first.body.updatedAt)
    })

    it('can be reversed by setting the status back to Active', async () => {
      const { id } = await create()
      await call('DELETE', `/suppliers/${id}`, 'admin-token')
      const response = await call('PATCH', `/suppliers/${id}`, 'admin-token', { status: 'Active' })
      assert.equal(response.body.status, 'Active')
      assert.equal((await call('GET', '/suppliers', 'member-token')).body.total, 1)
    })

    it('never removes the row', async () => {
      const { id } = await create()
      await call('DELETE', `/suppliers/${id}`, 'admin-token')
      assert.equal((await snapshot()).length, 1)
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM supplier_hours WHERE supplier_id = $1', [id])).rows[0].n, 7)
    })

    it('answers 404 for a supplier that does not exist, and for an id that is not a UUID', async () => {
      assert.equal((await call('DELETE', '/suppliers/00000000-0000-4000-8000-000000000000', 'admin-token')).status, 404)
      assert.equal((await call('DELETE', '/suppliers/not-a-uuid', 'admin-token')).status, 404)
    })
  })

  describe('read', () => {
    it('answers 404 for a supplier that does not exist', async () => {
      const response = await call('GET', '/suppliers/00000000-0000-4000-8000-000000000000', 'member-token')
      assert.equal(response.status, 404)
      assert.equal(response.body.error.code, 'NOT_FOUND')
    })

    it('sorts by name regardless of case', async () => {
      await create({ name: 'bravo' })
      await create({ name: 'Alpha' })
      await create({ name: 'charlie' })
      const response = await call('GET', '/suppliers', 'member-token')
      assert.deepEqual(response.body.items.map((s: { name: string }) => s.name), ['Alpha', 'bravo', 'charlie'])
    })

    it('answers 400 to a bad query, naming each parameter', async () => {
      const response = await call('GET', '/suppliers?pageSize=21&status=gone', 'member-token')
      assert.equal(response.status, 400)
      assert.deepEqual(
        response.body.error.fields.map((f: { field: string }) => f.field).sort(),
        ['pageSize', 'status'],
      )
    })
  })

  describe('availability', () => {
    it('says open, and until when, during opening hours', async () => {
      const { id } = await create()
      const response = await call('GET', `/suppliers/${id}`, 'member-token')
      assert.deepEqual(response.body.availability, { open: true, closesAt: '18:00', nextOpensAt: null })
    })

    it('evaluates any moment the Order Service asks about', async () => {
      const { id } = await create()
      const evening = await call('GET', `/suppliers/${id}/availability?at=2026-10-01T19:00:00%2B08:00`, 'member-token')
      assert.equal(evening.status, 200)
      assert.equal(evening.body.open, false)
      assert.equal(evening.body.orderable, false)
      assert.deepEqual(evening.body.nextOpensAt, { day: 'friday', time: '09:00' })

      const morning = await call('GET', `/suppliers/${id}/availability?at=2026-10-02T10:00:00%2B08:00`, 'member-token')
      assert.equal(morning.body.open, true)
      assert.equal(morning.body.orderable, true)
      assert.equal(morning.body.timezone, TIME_ZONE)
    })

    it('uses the current time when none is given', async () => {
      const { id } = await create()
      const response = await call('GET', `/suppliers/${id}/availability`, 'member-token')
      assert.equal(response.body.at, NOW.toISOString())
      assert.equal(response.body.open, true)
    })

    it('does not offer an Inactive supplier for new errands even while it is open', async () => {
      const { id } = await create()
      await call('DELETE', `/suppliers/${id}`, 'admin-token')
      const response = await call('GET', `/suppliers/${id}/availability`, 'member-token')
      assert.equal(response.body.open, true)
      assert.equal(response.body.status, 'Inactive')
      assert.equal(response.body.orderable, false)
    })

    it('refuses a time without an offset', async () => {
      const { id } = await create()
      const response = await call('GET', `/suppliers/${id}/availability?at=2026-10-01T12:00:00`, 'member-token')
      assert.equal(response.status, 400)
    })

    it('answers 404 for a supplier that does not exist', async () => {
      const response = await call('GET', '/suppliers/00000000-0000-4000-8000-000000000000/availability', 'member-token')
      assert.equal(response.status, 404)
    })
  })

  describe('when the database drops its connections', () => {
    it('recovers without a restart', async () => {
      await create()
      assert.equal((await call('GET', '/suppliers', 'member-token')).status, 200)

      // What a database restart does to the connections the pool holds.
      await pool.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
         WHERE datname = current_database() AND pid <> pg_backend_pid()`,
      )
      await new Promise((resolve) => setTimeout(resolve, 200))

      assert.equal((await call('GET', '/suppliers', 'member-token')).status, 200)
      const health = await app.inject({ method: 'GET', url: '/health' })
      assert.equal(health.statusCode, 200)
    })
  })

  describe('supplier types', () => {
    it('lets an administrator introduce a type nobody has used before', async () => {
      await create({ name: 'Spin Cycle', type: 'Laundry' })
      const found = await call('GET', '/suppliers?type=laundry', 'member-token')
      assert.equal(found.body.total, 1)
      assert.equal(found.body.items[0].type, 'Laundry')
    })

    it('has no separate category any more', async () => {
      const response = await call('POST', '/suppliers', 'admin-token', cafe({ category: 'Food' }))
      assert.equal(response.status, 400)
      assert.deepEqual(response.body.error.fields, [{ field: 'category', message: 'is not a known field' }])
    })
  })

  describe('photos', () => {
    const fetchPhoto = (url: string, headers: Record<string, string> = {}) =>
      app.inject({ method: 'GET', url, headers: { cookie: 'relay_session=member-token', ...headers } })

    it('stores a photo and its thumbnail, and links both from the supplier', async () => {
      const { id } = await create()
      const response = await call('PUT', `/suppliers/${id}/photo`, 'admin-token', photoBody())
      assert.equal(response.status, 200, JSON.stringify(response.body))
      const { path: photoPath, thumbnailPath } = response.body.photo
      assert.match(photoPath, new RegExp(`^/suppliers/${id}/photo\\?v=[0-9a-f]{16}$`))
      assert.equal(thumbnailPath, photoPath.replace('?v=', '?size=thumbnail&v='))

      const photo = await fetchPhoto(photoPath)
      assert.equal(photo.statusCode, 200)
      assert.equal(photo.headers['content-type'], 'image/jpeg')
      assert.deepEqual(photo.rawPayload, JPEG)
      assert.equal(photo.headers['cache-control'], 'private, max-age=31536000, immutable')
      const thumbnail = await fetchPhoto(thumbnailPath)
      assert.equal(thumbnail.headers['content-type'], 'image/png')
      assert.deepEqual(thumbnail.rawPayload, PNG)

      assert.deepEqual((await call('GET', '/suppliers', 'member-token')).body.items[0].photo, response.body.photo)
      assert.deepEqual((await call('GET', `/suppliers/${id}`, 'member-token')).body.photo, response.body.photo)
    })

    it('answers a repeated request with 304, and caches a link only while it names the current photo', async () => {
      const { id } = await create()
      const first = (await call('PUT', `/suppliers/${id}/photo`, 'admin-token', photoBody())).body.photo.path
      const etag = (await fetchPhoto(first)).headers.etag as string
      assert.equal((await fetchPhoto(first, { 'if-none-match': etag })).statusCode, 304)

      const other = Buffer.concat([JPEG, Buffer.from('new')])
      const second = (await call('PUT', `/suppliers/${id}/photo`, 'admin-token', photoBody(other))).body.photo.path
      assert.notEqual(second, first)
      const old = await fetchPhoto(first)
      assert.deepEqual(old.rawPayload, other, 'an old link shows the current photo')
      assert.equal(old.headers['cache-control'], 'private, no-cache')
      assert.equal((await fetchPhoto(first, { 'if-none-match': etag })).statusCode, 200)
    })

    it('lets only an administrator change the photo, and changes nothing otherwise', async () => {
      const { id } = await create()
      assert.equal((await call('PUT', `/suppliers/${id}/photo`, 'member-token', photoBody())).status, 403)
      assert.equal((await call('DELETE', `/suppliers/${id}/photo`, 'member-token')).status, 403)
      assert.equal((await call('PUT', `/suppliers/${id}/photo`, undefined, photoBody())).status, 401)
      assert.equal((await fetchPhoto(`/suppliers/${id}/photo`)).statusCode, 404)
    })

    it('names each invalid image and stores nothing', async () => {
      const { id } = await create()
      const response = await call('PUT', `/suppliers/${id}/photo`, 'admin-token', {
        photo: 'not an image',
        thumbnail: dataUrl('image/png', JPEG),
        caption: 'x',
      })
      assert.equal(response.status, 400)
      assert.deepEqual(response.body.error.fields.map((f: { field: string }) => f.field).sort(), ['caption', 'photo', 'thumbnail'])
      assert.equal((await fetchPhoto(`/suppliers/${id}/photo`)).statusCode, 404)
    })

    it('refuses a photo over 1 MB, and a request body over the limit', async () => {
      const { id } = await create()
      const large = Buffer.concat([JPEG, Buffer.alloc(1024 * 1024)])
      const tooLarge = await call('PUT', `/suppliers/${id}/photo`, 'admin-token', photoBody(large))
      assert.equal(tooLarge.status, 400)
      assert.deepEqual(tooLarge.body.error.fields, [{ field: 'photo', message: 'must be at most 1 MB' }])

      const huge = await call('PUT', `/suppliers/${id}/photo`, 'admin-token', { photo: 'x'.repeat(3 * 1024 * 1024) })
      assert.equal(huge.status, 413)
    })

    it('removes the photo, and removing it again changes nothing', async () => {
      const { id } = await create()
      await call('PUT', `/suppliers/${id}/photo`, 'admin-token', photoBody())
      const removed = await call('DELETE', `/suppliers/${id}/photo`, 'admin-token')
      assert.equal(removed.status, 200)
      assert.equal(removed.body.photo, null)
      assert.equal((await fetchPhoto(`/suppliers/${id}/photo`)).statusCode, 404)
      assert.equal((await call('DELETE', `/suppliers/${id}/photo`, 'admin-token')).status, 200)
    })

    it('answers 404 for a supplier that does not exist, and 400 for an unknown size', async () => {
      const missing = '00000000-0000-4000-8000-000000000000'
      assert.equal((await call('PUT', `/suppliers/${missing}/photo`, 'admin-token', photoBody())).status, 404)
      assert.equal((await call('DELETE', `/suppliers/${missing}/photo`, 'admin-token')).status, 404)
      assert.equal((await fetchPhoto('/suppliers/not-a-uuid/photo')).statusCode, 404)
      const { id } = await create()
      assert.equal((await fetchPhoto(`/suppliers/${id}/photo?size=huge`)).statusCode, 400)
    })
  })

  describe('favorites', () => {
    const favoriteIds = async (token: string) => {
      const response = await call('GET', '/suppliers/favorites', token)
      assert.equal(response.status, 200)
      return [...response.body.supplierIds].sort()
    }

    it('keeps the favorites of each account apart', async () => {
      const a = await create({ name: 'A' })
      const b = await create({ name: 'B' })
      assert.equal((await call('PUT', `/suppliers/${a.id}/favorite`, 'member-token')).status, 204)
      await call('PUT', `/suppliers/${b.id}/favorite`, 'member-token')
      await call('PUT', `/suppliers/${b.id}/favorite`, 'other-member-token')

      assert.deepEqual(await favoriteIds('member-token'), [a.id, b.id].sort())
      assert.deepEqual(await favoriteIds('other-member-token'), [b.id])
      assert.deepEqual(await favoriteIds('admin-token'), [])
    })

    it('takes the account only from the session, never from the request', async () => {
      const a = await create({ name: 'A' })
      await call('PUT', `/suppliers/${a.id}/favorite?accountId=member-account-3`, 'member-token', {
        accountId: 'member-account-3',
      })
      assert.deepEqual(await favoriteIds('member-token'), [a.id])
      assert.deepEqual(await favoriteIds('other-member-token'), [])
    })

    it('adds and removes the same way when repeated', async () => {
      const a = await create({ name: 'A' })
      assert.equal((await call('PUT', `/suppliers/${a.id}/favorite`, 'member-token')).status, 204)
      assert.equal((await call('PUT', `/suppliers/${a.id}/favorite`, 'member-token')).status, 204)
      assert.deepEqual(await favoriteIds('member-token'), [a.id])
      assert.equal((await call('DELETE', `/suppliers/${a.id}/favorite`, 'member-token')).status, 204)
      assert.equal((await call('DELETE', `/suppliers/${a.id}/favorite`, 'member-token')).status, 204)
      assert.deepEqual(await favoriteIds('member-token'), [])
    })

    it('answers 404 for a supplier that does not exist', async () => {
      assert.equal((await call('PUT', '/suppliers/00000000-0000-4000-8000-000000000000/favorite', 'member-token')).status, 404)
      assert.equal((await call('PUT', '/suppliers/not-a-uuid/favorite', 'member-token')).status, 404)
    })

    it('refuses a caller without a session or with an account that is not active', async () => {
      const a = await create({ name: 'A' })
      assert.equal((await call('PUT', `/suppliers/${a.id}/favorite`)).status, 401)
      assert.equal((await call('GET', '/suppliers/favorites')).status, 401)
      assert.equal((await call('PUT', `/suppliers/${a.id}/favorite`, 'suspended-token')).status, 403)
      assert.equal((await call('GET', '/suppliers/favorites', 'suspended-token')).status, 403)
    })

    it('lists only the caller own favorites with favorites=true, together with the other filters', async () => {
      const a = await create({ name: 'A', type: 'Food' })
      const b = await create({ name: 'B', type: 'Printing' })
      await create({ name: 'C', type: 'Food' })
      await call('PUT', `/suppliers/${a.id}/favorite`, 'member-token')
      await call('PUT', `/suppliers/${b.id}/favorite`, 'member-token')
      await call('PUT', `/suppliers/${b.id}/favorite`, 'other-member-token')

      const names = async (query: string, token = 'member-token') =>
        (await call('GET', `/suppliers${query}`, token)).body.items.map((s: { name: string }) => s.name)
      assert.deepEqual(await names('?favorites=true'), ['A', 'B'])
      assert.deepEqual(await names('?favorites=true&type=food'), ['A'])
      assert.deepEqual(await names('?favorites=true', 'other-member-token'), ['B'])
      assert.deepEqual(await names('?favorites=false'), ['A', 'B', 'C'])
      assert.equal((await call('GET', '/suppliers?favorites=maybe', 'member-token')).status, 400)
    })
  })

  describe('walking routes', () => {
    // NUS Co-op, and a point in Prince George's Park: about 1.4 km on the paths.
    const coop = { latitude: 1.2967866, longitude: 103.7732677 }
    const park = { latitude: 1.2908, longitude: 103.7809 }
    const walk = (id: string, to: object, token = 'member-token') => call('POST', `/suppliers/${id}/route`, token, { to })

    it('walks from the supplier to any point on the map', async () => {
      const { id } = await create(coop)
      const response = await walk(id, park)
      assert.equal(response.status, 200, JSON.stringify(response.body))
      const { from, metres, seconds, estimated, mapVersion } = response.body
      assert.deepEqual(from, coop)
      assert.equal(estimated, false)
      assert.ok(metres > 1300 && metres < 1550, `${metres} m`)
      assert.equal(seconds, Math.round(metres / 1.3))
      assert.match(mapVersion, /^\d{4}-\d{2}-\d{2}$/)
    })

    it('estimates a walk to a point off the map, and says so', async () => {
      const { id } = await create(coop)
      const response = await walk(id, { latitude: 1.3644, longitude: 103.9915 })
      assert.equal(response.status, 200)
      assert.equal(response.body.estimated, true)
      assert.equal(response.body.mapVersion, null)
    })

    it('refuses a supplier without a map location, one that does not exist, and a bad point', async () => {
      const { id } = await create({ latitude: null, longitude: null })
      const noLocation = await walk(id, park)
      assert.equal(noLocation.status, 422)
      assert.equal(noLocation.body.error.code, 'NO_LOCATION')
      assert.equal((await walk('00000000-0000-4000-8000-000000000000', park)).status, 404)
      const bad = await walk(id, { latitude: 'north', longitude: 103.7 })
      assert.equal(bad.status, 400)
      assert.deepEqual(bad.body.error.fields.map((f: { field: string }) => f.field), ['to.latitude'])
    })

    it('needs an active account, like every read', async () => {
      const { id } = await create(coop)
      assert.equal((await walk(id, park, 'suspended-token')).status, 403)
    })
  })

  describe('open now and nearest', () => {
    const every = (opens: string, closes: string) => DAYS.map((day) => ({ day, opens, closes }))
    const list = async (query: string) => {
      const response = await call('GET', `/suppliers${query}`, 'member-token')
      assert.equal(response.status, 200, JSON.stringify(response.body))
      return response.body
    }
    const names = (body: { items: { name: string }[] }) => body.items.map((s) => s.name)

    it('lists only the suppliers open now, and pages and counts them', async () => {
      await create({ name: 'Day' })
      await create({ name: 'Night', hours: every('22:00', '02:00') })
      await create({ name: 'Always', hours: every('00:00', '24:00') })
      await create({ name: 'Monday only', hours: [{ day: 'monday', opens: '09:00', closes: '18:00' }] })

      const open = await list('?openNow=true')
      assert.deepEqual(names(open), ['Always', 'Day'])
      assert.equal(open.total, 2)
      assert.equal(open.totalPages, 1)
      const second = await list('?openNow=true&pageSize=1&page=2')
      assert.deepEqual(names(second), ['Day'])
      assert.equal(second.total, 2)
      assert.deepEqual(names(await list('?openNow=true&q=day')), ['Day'])
      assert.equal((await list('?openNow=false')).total, 4)
      assert.equal((await call('GET', '/suppliers?openNow=yes', 'member-token')).status, 400)
    })

    it('never remembers which suppliers are open, only the suppliers themselves', async () => {
      let clock = NOW
      const cached = buildApp({ db: pool, authorizer, timeZone: TIME_ZONE, now: () => clock, readCacheSeconds: 60 })
      const open = async () =>
        (
          await cached.inject({ method: 'GET', url: '/suppliers?openNow=true', headers: { cookie: 'relay_session=member-token' } })
        ).json().total
      await create({ name: 'Day' })
      assert.equal(await open(), 1)
      clock = new Date('2026-10-01T12:00:00Z') // 20:00 in Singapore, after closing
      assert.equal(await open(), 0)
      await cached.close()
    })

    it('sorts by distance from a point, with suppliers without coordinates last', async () => {
      await create({ name: 'Library', latitude: 1.2967866, longitude: 103.7732677 })
      await create({ name: 'Park', latitude: 1.2908445, longitude: 103.7770891 })
      await create({ name: 'Nowhere', latitude: null, longitude: null })
      const near = 'near=1.2905,103.7772'

      const nearest = await list(`?sort=distance&${near}`)
      assert.deepEqual(names(nearest), ['Park', 'Library', 'Nowhere'])
      const [park, library, nowhere] = nearest.items
      assert.ok(park.distanceMeters < 100, `${park.distanceMeters}`)
      assert.ok(library.distanceMeters > 700 && library.distanceMeters < 900, `${library.distanceMeters}`)
      assert.equal(nowhere.distanceMeters, null)

      const byName = await list(`?${near}`)
      assert.deepEqual(names(byName), ['Library', 'Nowhere', 'Park'])
      assert.equal(byName.items[0].distanceMeters, library.distanceMeters)
      assert.equal((await list('')).items[0].distanceMeters, null)
    })

    it('combines open now with the nearest first', async () => {
      await create({ name: 'Library', latitude: 1.2967866, longitude: 103.7732677 })
      await create({ name: 'Park', latitude: 1.2908445, longitude: 103.7770891, hours: [{ day: 'monday', opens: '09:00', closes: '18:00' }] })
      await create({ name: 'Hall', latitude: 1.2915, longitude: 103.7768 })
      assert.deepEqual(names(await list('?openNow=true&sort=distance&near=1.2905,103.7772')), ['Hall', 'Library'])
    })

    it('refuses a sort by distance without a point, and a point that is not one', async () => {
      const fields = async (query: string) => {
        const response = await call('GET', `/suppliers${query}`, 'member-token')
        assert.equal(response.status, 400)
        return response.body.error.fields.map((f: { field: string }) => f.field)
      }
      assert.deepEqual(await fields('?sort=distance'), ['near'])
      assert.deepEqual(await fields('?sort=distance&near=here'), ['near'])
      assert.deepEqual(await fields('?near=95,0'), ['near'])
      assert.deepEqual(await fields('?near=1.29'), ['near'])
      assert.deepEqual(await fields('?sort=fastest'), ['sort'])
    })
  })

  describe('filter values', () => {
    // Which of two spellings is kept depends on the database collation, so only the words are compared.
    const lower = (values: string[]) => values.map((v) => v.toLowerCase())

    it('offers each type, zone and building of the Active suppliers once, ignoring case', async () => {
      await create({ name: 'A', type: 'Food', zone: 'Central', building: 'COM3' })
      await create({ name: 'B', type: 'food', zone: 'central', building: 'Central Library' })
      await create({ name: 'C', type: 'Printing', zone: 'Computing', building: 'COM3' })
      const { id } = await create({ name: 'D', type: 'Laundry', zone: 'Residences', building: 'PGP' })
      await call('DELETE', `/suppliers/${id}`, 'admin-token')

      const response = await call('GET', '/suppliers/filters', 'member-token')
      assert.equal(response.status, 200)
      assert.deepEqual(lower(response.body.types), ['food', 'printing'])
      assert.deepEqual(lower(response.body.zones), ['central', 'computing'])
      assert.deepEqual(response.body.buildings, ['Central Library', 'COM3'])
    })

    it('takes the same status as the list', async () => {
      await create({ name: 'A', type: 'Food' })
      const { id } = await create({ name: 'D', type: 'Laundry' })
      await call('DELETE', `/suppliers/${id}`, 'admin-token')

      assert.deepEqual((await call('GET', '/suppliers/filters?status=Inactive', 'member-token')).body.types, ['Laundry'])
      assert.deepEqual((await call('GET', '/suppliers/filters?status=all', 'member-token')).body.types, ['Food', 'Laundry'])
    })

    it('offers empty lists when there is no supplier', async () => {
      const response = await call('GET', '/suppliers/filters', 'member-token')
      assert.deepEqual(response.body, { types: [], zones: [], buildings: [] })
    })

    it('answers 400 to an unknown status', async () => {
      const response = await call('GET', '/suppliers/filters?status=gone', 'member-token')
      assert.equal(response.status, 400)
      assert.deepEqual(response.body.error.fields.map((f: { field: string }) => f.field), ['status'])
    })
  })

  describe('read cache', () => {
    let cached: FastifyInstance

    before(() => {
      cached = buildApp({
        db: pool,
        authorizer,
        timeZone: TIME_ZONE,
        now: () => NOW,
        readCacheSeconds: 60,
      })
    })
    after(() => cached.close())

    const total = async () =>
      (
        await cached.inject({ method: 'GET', url: '/suppliers', headers: { cookie: 'relay_session=member-token' } })
      ).json().total

    it('answers a repeated search from memory', async () => {
      await create()
      assert.equal(await total(), 1)
      await pool.query(
        `INSERT INTO suppliers (name, type, zone, building, address)
         VALUES ('Added behind its back', 'Food', 'Central', 'B', 'A')`,
      )
      assert.equal(await total(), 1, 'still the remembered answer')
      assert.equal((await call('GET', '/suppliers', 'member-token')).body.total, 2, 'the database has it')
    })

    it('shows a change made through the API at once', async () => {
      await create()
      assert.equal(await total(), 1)
      const response = await cached.inject({
        method: 'POST',
        url: '/suppliers',
        headers: { cookie: 'relay_session=admin-token' },
        payload: cafe({ name: 'Second Cafe' }),
      })
      assert.equal(response.statusCode, 201)
      assert.equal(await total(), 2)

      const { id } = response.json()
      await cached.inject({
        method: 'DELETE',
        url: `/suppliers/${id}`,
        headers: { cookie: 'relay_session=admin-token' },
      })
      assert.equal(await total(), 1, 'a deactivated supplier disappears from the listing at once')
    })

    it('shows a new photo in the listing at once', async () => {
      const { id } = await create()
      const photo = async () =>
        (
          await cached.inject({ method: 'GET', url: '/suppliers', headers: { cookie: 'relay_session=member-token' } })
        ).json().items[0].photo
      assert.equal(await photo(), null)
      await cached.inject({
        method: 'PUT',
        url: `/suppliers/${id}/photo`,
        headers: { cookie: 'relay_session=admin-token' },
        payload: photoBody(),
      })
      assert.notEqual(await photo(), null)
    })

    it('never serves a list of favorites from memory', async () => {
      const { id } = await create()
      const favorites = async () =>
        (
          await cached.inject({
            method: 'GET',
            url: '/suppliers?favorites=true',
            headers: { cookie: 'relay_session=member-token' },
          })
        ).json().total
      assert.equal(await favorites(), 0)
      await cached.inject({ method: 'PUT', url: `/suppliers/${id}/favorite`, headers: { cookie: 'relay_session=member-token' } })
      assert.equal(await favorites(), 1)
    })

    it('never answers a caller who has no right to the memory', async () => {
      await create()
      await total()
      const anonymous = await cached.inject({ method: 'GET', url: '/suppliers' })
      assert.equal(anonymous.statusCode, 401)
    })

    it('never serves the availability of a supplier from memory', async () => {
      const { id } = await create()
      const ask = () =>
        cached.inject({
          method: 'GET',
          url: `/suppliers/${id}/availability`,
          headers: { cookie: 'relay_session=member-token' },
        })
      assert.equal((await ask()).json().orderable, true)
      await pool.query(`UPDATE suppliers SET status = 'Inactive' WHERE id = $1`, [id])
      assert.equal((await ask()).json().orderable, false)
    })
  })

  describe('with the seed data', () => {
    beforeEach(async () => {
      assert.equal(await seedIfEmpty(pool, SEED_FILE, silent), 21)
    })

    const search = async (query: string) => {
      const response = await call('GET', `/suppliers${query}`, 'member-token')
      assert.equal(response.status, 200, JSON.stringify(response.body))
      return response.body
    }
    const names = (body: { items: { name: string }[] }) => body.items.map((s) => s.name).sort()

    it('seeds once and leaves later changes alone', async () => {
      assert.equal(await seedIfEmpty(pool, SEED_FILE, silent), 0)
      const { items } = await search('?q=Anna')
      await call('DELETE', `/suppliers/${items[0].id}`, 'admin-token')
      assert.equal(await seedIfEmpty(pool, SEED_FILE, silent), 0)
      assert.equal((await search('?status=Inactive')).total, 1)
      assert.equal((await search('')).total, 20)
    })

    it('seeds once when several instances start together', async () => {
      await pool.query('TRUNCATE suppliers CASCADE')
      const results = await Promise.all([1, 2, 3, 4].map(() => seedIfEmpty(pool, SEED_FILE, silent)))
      assert.deepEqual(results.sort((a, b) => b - a), [21, 0, 0, 0])
      assert.equal((await search('')).total, 21)
    })

    it('adds the seed photos once, and never brings back one an administrator removed', async () => {
      assert.equal(await seedPhotosOnce(pool, SEED_FILE, silent), 6)
      const [coop] = (await search('?q=Co-op')).items
      assert.notEqual(coop.photo, null)
      const image = await app.inject({ method: 'GET', url: coop.photo.path, headers: { cookie: 'relay_session=member-token' } })
      assert.equal(image.headers['content-type'], 'image/jpeg')

      await call('DELETE', `/suppliers/${coop.id}/photo`, 'admin-token')
      assert.equal(await seedPhotosOnce(pool, SEED_FILE, silent), 0)
      assert.equal((await search('?q=Co-op')).items[0].photo, null)
    })

    it('keeps its one run when the photo files are missing', async () => {
      assert.equal(await seedPhotosOnce(pool, SEED_FILE, silent, path.join(import.meta.dirname, 'no-such-folder')), 0)
      assert.equal(await seedPhotosOnce(pool, SEED_FILE, silent), 6)
    })

    it('does not run the migrations twice', async () => {
      assert.deepEqual(await migrate(pool, MIGRATIONS), [])
    })

    it('searches by keyword across name and type', async () => {
      assert.deepEqual(names(await search('?q=coffee')), [
        'Cafe+ Robot Cafe',
        'Good Day Cafe',
        'The Coffee Roaster',
        'TOMORO COFFEE',
        'he by He Brews',
      ].sort())
    })

    it('needs every word to match, in any order and any case', async () => {
      assert.equal((await search('?q=prince%20george')).total, 3)
      assert.equal((await search('?q=GEORGE%20PRINCE')).total, 3)
      assert.equal((await search('?q=george%20printer')).total, 0)
    })

    it('treats % and _ as plain characters', async () => {
      assert.equal((await search('?q=%25')).total, 0)
      assert.equal((await search('?q=_')).total, 0)
    })

    it('filters by type, zone and building, ignoring case', async () => {
      assert.deepEqual(names(await search('?type=Printing')), ['Goh Bros E-Print Pte Ltd', 'Printer @ Com 2'])
      assert.equal((await search('?type=food/coffee')).total, 5)
      assert.equal((await search('?type=Food')).total, 11, 'Food does not include Food/Coffee')
      assert.equal((await search('?type=Shopping')).total, 3)
      assert.equal((await search('?zone=central')).total, 6)
      assert.equal((await search('?building=com2')).total, 2)
    })

    it('offers the types and zones the seed data uses', async () => {
      const { types, zones } = await search('/filters')
      assert.deepEqual(types, ['Food', 'Food/Coffee', 'Printing', 'Shopping'])
      assert.deepEqual(zones, ['Business', 'Central', 'Computing', 'Engineering', 'Medicine', 'Residences', 'Science'])
    })

    it('combines filters and keywords', async () => {
      assert.equal((await search('?zone=Central&type=Food')).total, 2)
      assert.equal((await search('?zone=Central&q=coffee')).total, 2)
    })

    it('pages in 20s with the total count', async () => {
      const first = await search('')
      assert.equal(first.items.length, 20)
      assert.equal(first.total, 21)
      assert.equal(first.totalPages, 2)

      const second = await search('?page=2')
      assert.equal(second.items.length, 1)
      const ids = new Set([...first.items, ...second.items].map((s: { id: string }) => s.id))
      assert.equal(ids.size, 21)

      assert.equal((await search('?page=3')).items.length, 0)
      assert.equal((await search('?pageSize=5&page=5')).items.length, 1)
    })

    it('exposes whether each supplier is open now', async () => {
      const [coop] = (await search('?q=Co-op')).items
      assert.deepEqual(coop.availability, { open: true, closesAt: '16:00', nextOpensAt: null })
      const [octobox] = (await search('?q=Octobox')).items
      assert.deepEqual(octobox.availability, { open: true, closesAt: null, nextOpensAt: null })
    })

    it('knows a supplier that closes after midnight is still open at 01:00', async () => {
      const [supersnacks] = (await search('?q=Supersnacks')).items
      const response = await call(
        'GET',
        `/suppliers/${supersnacks.id}/availability?at=2026-10-02T01:00:00%2B08:00`,
        'member-token',
      )
      assert.equal(response.body.open, true)
      assert.equal(response.body.closesAt, '02:00')
    })
  })
})
