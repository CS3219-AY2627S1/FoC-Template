// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-10-25
// Scope: Integrated author-defined service-type baselines.
// Author review: Reviewed outputs, corrected phrasing and syntax, and adjusted implementation
// details to fit project requirements.

import { ServiceType as SupplierServiceType } from '@relay/contracts/supplier'

export type ServiceTypeBaseline = {
  base: number
  min: number
  max: number
  name: string
  standardWindowMinutes: number
}

/** Default baseline for unknown service types */
export const DEFAULT_BASELINE: ServiceTypeBaseline = {
  base: 20,
  min: 15,
  max: 40,
  name: 'Unknown',
  standardWindowMinutes: 120,
}

/** Service type baselines configuration - keyed by supplier service type for extensibility */
export const CREDIT_BASELINES = {
  [SupplierServiceType.Food]: {
    base: 15,
    min: 10,
    max: 30,
    name: 'Food',
    standardWindowMinutes: 90,
  },
  [SupplierServiceType.Drink]: {
    base: 10,
    min: 8,
    max: 20,
    name: 'Drink',
    standardWindowMinutes: 60,
  },
  [SupplierServiceType.Shopping]: {
    base: 20,
    min: 15,
    max: 40,
    name: 'Shopping',
    standardWindowMinutes: 180,
  },
  [SupplierServiceType.Printing]: {
    base: 10,
    min: 8,
    max: 25,
    name: 'Printing',
    standardWindowMinutes: 120,
  },
  [SupplierServiceType.Parcel]: {
    base: 25,
    min: 15,
    max: 50,
    name: 'Parcel',
    standardWindowMinutes: 240,
  },
} as const satisfies Record<SupplierServiceType, ServiceTypeBaseline>

export type CreditBaseline = (typeof CREDIT_BASELINES)[SupplierServiceType]

export function getBaselineForServiceType(serviceType: number): ServiceTypeBaseline {
  const baseline = CREDIT_BASELINES[serviceType as keyof typeof CREDIT_BASELINES] as
    ServiceTypeBaseline | undefined
  return baseline ?? DEFAULT_BASELINE
}

function parseBaseline(value: string): [number, number, number] {
  const [base, min, max] = value.split(',').map((v) => parseInt(v.trim(), 10))
  return [base, min, max]
}

/**
 * Format: BASELINE_<TYPE>=<base>,<min>,<max>
 * e.g., BASELINE_FOOD=15,10,30
 */
export function loadBaselinesFromEnv(): Record<number, ServiceTypeBaseline> {
  // Map env var names to service types
  const baselineConfig: Record<string, number> = {
    baselineFood: SupplierServiceType.Food,
    baselineDrink: SupplierServiceType.Drink,
    baselineShopping: SupplierServiceType.Shopping,
    baselinePrinting: SupplierServiceType.Printing,
    baselineParcel: SupplierServiceType.Parcel,
  }

  const result: Record<number, ServiceTypeBaseline> = {} as Record<number, ServiceTypeBaseline>

  for (const [envKey, serviceType] of Object.entries(baselineConfig)) {
    const envValue = process.env[envKey]
    if (envValue) {
      const [base, min, max] = parseBaseline(envValue)
      const configuredBaseline = getBaselineForServiceType(serviceType)
      result[serviceType] = {
        base,
        min,
        max,
        name: configuredBaseline.name,
        standardWindowMinutes: configuredBaseline.standardWindowMinutes,
      }
    }
  }

  return result
}
