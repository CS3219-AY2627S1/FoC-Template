import type { FastifyInstance, FastifyRequest } from 'fastify'
import { type Authorizer, type Operation } from './auth.ts'
import { HttpError, notFound, validationFailed } from './errors.ts'
import { evaluateAvailability, toLocalMoment, type LocalMoment } from './domain/availability.ts'
import { MAX_PHOTO_BYTES, MAX_THUMBNAIL_BYTES, validatePhoto } from './domain/photo.ts'
import { parseAt, parseFilterValuesQuery, parseListQuery } from './domain/query.ts'
import { WEEKDAYS, type Supplier } from './domain/supplier.ts'
import { formatClock } from './domain/time.ts'
import { validateCreate, validatePatch } from './domain/validation.ts'
import { parseRouteRequest, walkingRoute, type WalkMap } from './domain/walking.ts'
import type { TtlCache } from './cache.ts'
import type { Pool } from './db.ts'
import * as repository from './repository.ts'

export interface RouteDeps {
  db: Pool
  authorizer: Authorizer
  timeZone: string
  now: () => Date
  listCache: TtlCache<{ items: Supplier[]; total: number }>
  // Null when the map could not be loaded; routes are then estimates.
  walkMap: WalkMap | null
}

interface Params {
  id: string
}

// Base64 makes the two images a third larger, and the JSON around them needs a little room.
const PHOTO_BODY_LIMIT = Math.ceil(((MAX_PHOTO_BYTES + MAX_THUMBNAIL_BYTES) * 4) / 3) + 4096

declare module 'fastify' {
  interface FastifyRequest {
    // The account the User Service approved. Set by the onRequest check.
    actorId: string
  }
}

function present(supplier: Supplier, moment: LocalMoment) {
  return {
    id: supplier.id,
    name: supplier.name,
    type: supplier.type,
    zone: supplier.zone,
    building: supplier.building,
    address: supplier.address,
    description: supplier.description,
    latitude: supplier.latitude,
    longitude: supplier.longitude,
    contact: { phone: supplier.phone, email: supplier.email },
    hours: supplier.hours.map((h) => ({
      day: WEEKDAYS[h.day],
      opens: formatClock(h.opens),
      closes: formatClock(h.closes),
    })),
    status: supplier.status,
    // Paths on this service, like the Location header. The version in them changes with
    // every new photo, so a browser may keep a photo it fetched through one for good.
    photo: supplier.photoVersion
      ? {
          path: `/suppliers/${supplier.id}/photo?v=${supplier.photoVersion}`,
          thumbnailPath: `/suppliers/${supplier.id}/photo?size=thumbnail&v=${supplier.photoVersion}`,
        }
      : null,
    availability: evaluateAvailability(supplier.hours, moment),
    // Whole metres from the list's near point, or null.
    distanceMeters: supplier.distanceMeters === null ? null : Math.round(supplier.distanceMeters),
    createdAt: supplier.createdAt.toISOString(),
    updatedAt: supplier.updatedAt.toISOString(),
  }
}

export function registerRoutes(app: FastifyInstance, deps: RouteDeps): void {
  app.decorateRequest('actorId', '')

  // Every route asks the user-service in an onRequest hook, which runs before
  // the body is parsed or validated and before the database is touched. A
  // refused caller learns nothing about which suppliers exist, and nothing is
  // changed.
  const requires = (operation: Operation) => async (request: FastifyRequest) => {
    const decision = await deps.authorizer.authorize(request.headers.cookie, operation)
    if (decision.kind === 'unauthenticated') {
      request.log.info({ operation }, 'refused: no session')
      throw new HttpError(401, 'UNAUTHENTICATED', 'A valid session is required')
    }
    if (decision.kind === 'denied') {
      // Refused either way, but an operator needs to tell the two apart.
      if (decision.unavailable) request.log.warn('The user-service could not be asked, so the request was refused')
      request.log.info({ operation }, 'refused')
      throw new HttpError(403, 'FORBIDDEN', 'You are not allowed to do this')
    }
    // Reads are already in the request log, and there are a great many of them.
    if (operation !== 'supplier.read') {
      request.log.info({ operation, accountId: decision.accountId }, 'authorized')
    }
    request.actorId = decision.accountId
  }

  app.get('/health', async (_request, reply) => {
    try {
      await deps.db.query('SELECT 1')
      return { status: 'ok' }
    } catch {
      return reply.status(503).send({ status: 'unavailable' })
    }
  })

  app.get('/suppliers', { onRequest: requires('supplier.read') }, async (request) => {
    const parsed = parseListQuery(request.query as Record<string, unknown>)
    if ('errors' in parsed) throw validationFailed(parsed.errors)

    // Suppliers change rarely and are read constantly, so the same search is
    // answered from memory for a couple of seconds. The opening hours are
    // evaluated below on every request, never cached. A list of favorites
    // belongs to one account and changes at a tap, so it always comes fresh.
    const filters = parsed.value
    const accountId = filters.favorites ? request.actorId : null
    const moment = toLocalMoment(deps.now(), deps.timeZone)
    const remembered = (key: object, load: () => Promise<{ items: Supplier[]; total: number }>) =>
      filters.favorites ? load() : deps.listCache.get(JSON.stringify(key), load)

    let found: { items: Supplier[]; total: number }
    if (!filters.openNow) {
      found = await remembered(filters, () => repository.listSuppliers(deps.db, filters, accountId))
    } else {
      // Open or closed is worked out in code (src/domain/availability.ts), which copes with hours
      // past midnight and the end of the week, so the database cannot page by it. Every match is
      // loaded, the open ones kept and the page cut here, which is quick for one campus. Only the
      // stored rows may come from memory, never which of them are open.
      const all = await remembered({ ...filters, openNow: false, page: 0, pageSize: 0 }, () =>
        repository.listSuppliers(deps.db, filters, accountId, true),
      )
      const open = all.items.filter((s) => evaluateAvailability(s.hours, moment).open)
      const start = (filters.page - 1) * filters.pageSize
      found = { items: open.slice(start, start + filters.pageSize), total: open.length }
    }
    return {
      items: found.items.map((s) => present(s, moment)),
      page: filters.page,
      pageSize: filters.pageSize,
      total: found.total,
      totalPages: Math.ceil(found.total / filters.pageSize),
    }
  })

  // Type, zone and building are free text, so a client cannot know which values exist. Not
  // cached: one cheap query, asked once when a list page opens.
  app.get('/suppliers/filters', { onRequest: requires('supplier.read') }, async (request) => {
    const parsed = parseFilterValuesQuery(request.query as Record<string, unknown>)
    if ('errors' in parsed) throw validationFailed(parsed.errors)
    return repository.listFilterValues(deps.db, parsed.value)
  })

  // The caller's own favorites. The account comes from the session, so nobody can
  // ask for another account's. A read, so its approval may come from the auth cache.
  app.get('/suppliers/favorites', { onRequest: requires('supplier.read') }, async (request) => ({
    supplierIds: await repository.listFavoriteIds(deps.db, request.actorId),
  }))

  app.put<{ Params: Params }>('/suppliers/:id/favorite', { onRequest: requires('supplier.favorite') }, async (request, reply) => {
    if (!(await repository.addFavorite(deps.db, request.actorId, request.params.id))) throw notFound()
    return reply.status(204).send()
  })

  // Removing a favorite that is not there changes nothing, so it answers the same.
  app.delete<{ Params: Params }>('/suppliers/:id/favorite', { onRequest: requires('supplier.favorite') }, async (request, reply) => {
    await repository.removeFavorite(deps.db, request.actorId, request.params.id)
    return reply.status(204).send()
  })

  // Inactive suppliers stay retrievable here, for errands that already use them.
  app.get<{ Params: Params }>('/suppliers/:id', { onRequest: requires('supplier.read') }, async (request) => {
    const supplier = await repository.getSupplier(deps.db, request.params.id)
    if (!supplier) throw notFound()
    return present(supplier, toLocalMoment(deps.now(), deps.timeZone))
  })

  // For the Order Service, which has to know whether a supplier will be open at
  // the time an errand is needed by.
  app.get<{ Params: Params }>('/suppliers/:id/availability', { onRequest: requires('supplier.read') }, async (request) => {
    const parsed = parseAt(request.query as Record<string, unknown>)
    if ('errors' in parsed) throw validationFailed(parsed.errors)
    const supplier = await repository.getSupplier(deps.db, request.params.id)
    if (!supplier) throw notFound()

    const at = parsed.value ?? deps.now()
    const availability = evaluateAvailability(supplier.hours, toLocalMoment(at, deps.timeZone))
    return {
      supplierId: supplier.id,
      at: at.toISOString(),
      timezone: deps.timeZone,
      status: supplier.status,
      ...availability,
      // What a new errand may use: not deactivated, and open at that time.
      orderable: supplier.status === 'Active' && availability.open,
    }
  })

  // The walk from the supplier to any point, for an errand's drop-off. POST, so that the point, which
  // may be where a student lives, travels in the body and stays out of the gateway's access log. It
  // is not logged here either, and nothing is stored.
  app.post<{ Params: Params }>('/suppliers/:id/route', { onRequest: requires('supplier.read') }, async (request) => {
    const parsed = parseRouteRequest(request.body)
    if ('errors' in parsed) throw validationFailed(parsed.errors)
    const supplier = await repository.getSupplier(deps.db, request.params.id)
    if (!supplier) throw notFound()
    if (supplier.latitude === null || supplier.longitude === null) {
      throw new HttpError(422, 'NO_LOCATION', 'This supplier has no map location')
    }
    const from = { latitude: supplier.latitude, longitude: supplier.longitude }
    // The start too, so that an errand can keep the point its walk was measured from.
    return { from, ...walkingRoute(deps.walkMap, from, parsed.value) }
  })

  app.get<{ Params: Params }>('/suppliers/:id/photo', { onRequest: requires('supplier.read') }, async (request, reply) => {
    const query = request.query as Record<string, unknown>
    const size = query.size ?? 'photo'
    if (size !== 'photo' && size !== 'thumbnail') {
      throw validationFailed([{ field: 'size', message: 'must be photo or thumbnail' }])
    }
    const photo = await repository.getSupplierPhoto(deps.db, request.params.id, size)
    if (!photo) throw new HttpError(404, 'NOT_FOUND', 'This supplier has no photo')

    const etag = `"${photo.version}-${size}"`
    // private: only a signed-in member may see it, so no shared cache may keep a copy.
    reply.header('cache-control', query.v === photo.version ? 'private, max-age=31536000, immutable' : 'private, no-cache')
    reply.header('etag', etag)
    reply.header('x-content-type-options', 'nosniff')
    if (request.headers['if-none-match'] === etag) return reply.status(304).send()
    return reply.type(photo.type).send(photo.bytes)
  })

  app.put<{ Params: Params }>(
    '/suppliers/:id/photo',
    { onRequest: requires('supplier.update'), bodyLimit: PHOTO_BODY_LIMIT },
    async (request) => {
      const parsed = validatePhoto(request.body)
      if ('errors' in parsed) throw validationFailed(parsed.errors)
      const supplier = await repository.setSupplierPhoto(deps.db, request.params.id, parsed.value, request.actorId)
      deps.listCache.clear()
      if (!supplier) throw notFound()
      return present(supplier, toLocalMoment(deps.now(), deps.timeZone))
    },
  )

  app.delete<{ Params: Params }>('/suppliers/:id/photo', { onRequest: requires('supplier.update') }, async (request) => {
    const supplier = await repository.removeSupplierPhoto(deps.db, request.params.id, request.actorId)
    deps.listCache.clear()
    if (!supplier) throw notFound()
    return present(supplier, toLocalMoment(deps.now(), deps.timeZone))
  })

  app.post('/suppliers', { onRequest: requires('supplier.create') }, async (request, reply) => {
    const parsed = validateCreate(request.body)
    if ('errors' in parsed) throw validationFailed(parsed.errors)

    const supplier = await repository.createSupplier(deps.db, parsed.value, request.actorId)
    deps.listCache.clear()
    return reply
      .status(201)
      .header('location', `/suppliers/${supplier.id}`)
      .send(present(supplier, toLocalMoment(deps.now(), deps.timeZone)))
  })

  app.patch<{ Params: Params }>('/suppliers/:id', { onRequest: requires('supplier.update') }, async (request) => {
    const parsed = validatePatch(request.body)
    if ('errors' in parsed) throw validationFailed(parsed.errors)

    const supplier = await repository.updateSupplier(deps.db, request.params.id, parsed.value, request.actorId)
    deps.listCache.clear()
    if (!supplier) throw notFound()
    return present(supplier, toLocalMoment(deps.now(), deps.timeZone))
  })

  // Deleting a supplier means deactivating it. The record stays.
  app.delete<{ Params: Params }>('/suppliers/:id', { onRequest: requires('supplier.deactivate') }, async (request) => {
    const supplier = await repository.deactivateSupplier(deps.db, request.params.id, request.actorId)
    deps.listCache.clear()
    if (!supplier) throw notFound()
    return present(supplier, toLocalMoment(deps.now(), deps.timeZone))
  })
}
