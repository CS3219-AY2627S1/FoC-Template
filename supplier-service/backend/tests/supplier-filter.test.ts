// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-11-08
// Scope: Generated tests for operational-status and service-type filtering.
// Author review: Reviewed the generated test logic to ensure the cases were meaningful and correctly
// tested the intended behavior. Corrected tests where necessary.

import { describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { buildSupplierFilter } from '../src/db'

describe('buildSupplierFilter', () => {
  it('builds correct filter without any filters', () => {
    assert.deepEqual(buildSupplierFilter(), { where: '', params: [] })
  })

  it('treats "all" status as no status filter', () => {
    assert.deepEqual(buildSupplierFilter({ status: 'all' }), { where: '', params: [] })
  })

  it('applies status filter correctly', () => {
    assert.deepEqual(buildSupplierFilter({ status: 'operational' }), {
      where: 'is_operational = $1',
      params: [true],
    })
  })

  it('applies service type filter with array overlap', () => {
    assert.deepEqual(buildSupplierFilter({ serviceTypes: [0, 2] }), {
      where: 'service_types && $1',
      params: [[0, 2]],
    })
  })

  it('returns empty result for empty service type selection', () => {
    assert.deepEqual(buildSupplierFilter({ serviceTypes: [] }), { where: 'FALSE', params: [] })
  })

  it('combines filters keeping parameter order', () => {
    assert.deepEqual(buildSupplierFilter({ status: 'not-operational', serviceTypes: [3] }), {
      where: 'is_operational = $1 AND service_types && $2',
      params: [false, [3]],
    })
  })
})
