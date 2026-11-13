// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-11-09
// Scope: Generated tests for baseline coverage validation.
// Author review: Reviewed the generated test logic to ensure the cases were meaningful and correctly
// tested the intended behavior. Corrected tests where necessary.

import { ServiceType } from '@relay/contracts/supplier'
import { describe, expect, it } from 'vitest'
import { CREDIT_BASELINES, type ServiceTypeBaseline } from '../src/config/baselines'
import { assertAllServiceTypesHaveBaselines } from '../src/validators/baseline.validator'

describe('credit estimation baseline validation', () => {
  it('accepts a baseline for every service type in contracts', () => {
    expect(() => assertAllServiceTypesHaveBaselines()).not.toThrow()
    expect(Object.keys(CREDIT_BASELINES)).toHaveLength(Object.keys(ServiceType).length)
  })

  it('raises a clear error when a contract service type has no baseline', () => {
    const incompleteBaselines: Partial<Record<ServiceType, ServiceTypeBaseline>> = {
      ...CREDIT_BASELINES,
    }
    delete incompleteBaselines[ServiceType.Parcel]

    expect(() => assertAllServiceTypesHaveBaselines(incompleteBaselines)).toThrow(
      'Missing credit estimation baseline for contract service type(s): Parcel (4)',
    )
  })
})
