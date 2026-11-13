// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-11-08
// Scope: Generated tests for author-defined Supplier administrator access behavior.
// Author review: Reviewed the generated test logic to ensure the cases were meaningful and correctly
// tested the intended behavior. Corrected tests where necessary.

import { describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { SupplierController } from '../src/controllers/supplier.controller.js'
import { createSupplierRouter } from '../src/routes/supplier.routes.js'
import { userAuthAdminMiddleware } from '@relay/user-auth-backend-middleware'

const body = {
  name: 'Supplier',
  location: { lat: 1, lng: 103, buildingName: 'Building', floorNumber: 1 },
  isOperational: true,
  operatingHours: { openingTime: '09:00', closingTime: '18:00', daysOfWeek: [1] },
  serviceTypes: [0],
}
function response() {
  const res: Record<string, unknown> = { statusCode: 200 }
  res.status = (code: number) => {
    res.statusCode = code
    return res
  }
  res.json = () => res
  res.send = () => res
  return res
}

describe('admin-access', () => {
  for (const role of ['admin', 'super-admin'] as const) {
    it(`${role} can create, update and delete suppliers without a profile lookup`, async () => {
      const calls: string[] = []
      const controller = new SupplierController({
        createSupplier: async () => {
          calls.push('create')
          return { id: 's1' }
        },
        updateSupplier: async () => {
          calls.push('update')
          return { id: 's1' }
        },
        deleteSupplier: async () => {
          calls.push('delete')
        },
      } as never)
      const req = {
        user: { sub: 'subject', email: 'admin@example.com', emailVerified: true, role },
        body,
        params: { id: 's1' },
      }
      const next = (error: unknown) => {
        throw error
      }
      await controller.createSupplier(req as never, response() as never, next)
      await controller.updateSupplier(req as never, response() as never, next)
      await controller.deleteSupplier(req as never, response() as never, next)
      assert.deepEqual(calls, ['create', 'update', 'delete'])
    })
  }

  it('supplier mutation routes require Cognito admin middleware', () => {
    const router = createSupplierRouter(new SupplierController({} as never))
    const mutations = router.stack.filter(
      (layer) =>
        layer.route && ['post', 'put', 'delete'].some((method) => layer.route.methods[method]),
    )
    assert.equal(mutations.length, 3)
    for (const layer of mutations)
      assert.equal(layer.route.stack[0].handle, userAuthAdminMiddleware)
  })

  it('unverified users cannot access suppliers', async () => {
    const controller = new SupplierController({
      getAllSuppliers: async () => {
        throw new Error('must not read')
      },
    } as never)
    const res = response()
    await controller.getAllSuppliers(
      {
        user: { sub: 'subject', email: 'u@example.com', emailVerified: false, role: 'user' },
        query: {},
      } as never,
      res as never,
      (e) => {
        throw e
      },
    )
    assert.equal(res.statusCode, 401)
  })
})
