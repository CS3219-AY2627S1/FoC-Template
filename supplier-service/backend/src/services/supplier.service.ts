// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-09-28
// Scope: Implemented author-defined Supplier CRUD and filtering behavior plus the Supplier-to-Errand
// notification flow and its retry/error handling.
// Author review: Reviewed outputs, corrected phrasing and syntax, and adjusted implementation
// details to fit project requirements.

import {
  SupplierErrors,
  type Supplier,
  type GetSuppliersFilterParams,
  type ValidateSupplierSelectionRequest,
  type ValidateSupplierSelectionResponse,
} from '@relay/contracts/supplier'
import { SupplierRepository } from '../repositories/supplier.repository.js'
import { isSupplierActive } from './supplier-availability.js'

export class SupplierService {
  constructor(private readonly repository: SupplierRepository) {}

  async getAllSuppliers(filters?: GetSuppliersFilterParams): Promise<Supplier[]> {
    return await this.repository.findAll(filters)
  }

  async getSupplierById(id: string): Promise<Supplier | null> {
    return await this.repository.findById(id)
  }

  async validateSupplierSelection(
    request: ValidateSupplierSelectionRequest,
  ): Promise<ValidateSupplierSelectionResponse> {
    const supplier = await this.repository.findById(request.supplierId)
    if (!supplier) {
      return {
        valid: false,
        supplierId: request.supplierId,
        code: 'SUPPLIER_NOT_FOUND',
        message: 'Supplier not found.',
      }
    }

    if (!isSupplierActive(supplier)) {
      return {
        valid: false,
        supplierId: request.supplierId,
        code: 'SUPPLIER_INACTIVE',
        message: 'The supplier is not currently active.',
      }
    }

    if (request.serviceType !== undefined && !supplier.serviceTypes.includes(request.serviceType)) {
      return {
        valid: false,
        supplierId: request.supplierId,
        code: 'SERVICE_TYPE_NOT_OFFERED',
        message: 'The supplier does not offer the selected service type.',
      }
    }

    return {
      valid: true,
      supplierId: request.supplierId,
      ...(request.serviceType !== undefined ? { serviceType: request.serviceType } : {}),
    }
  }

  async createSupplier(data: {
    name: string
    location: Supplier['location']
    isOperational: boolean
    operatingHours: Supplier['operatingHours']
    serviceTypes: Supplier['serviceTypes']
  }): Promise<Supplier> {
    try {
      return await this.repository.create({
        name: data.name,
        location: data.location,
        isOperational: data.isOperational,
        operatingHours: data.operatingHours,
        serviceTypes: data.serviceTypes,
      })
    } catch (error: any) {
      if (error?.message === SupplierErrors.DUPLICATE_SUPPLIER) {
        throw new Error(SupplierErrors.DUPLICATE_SUPPLIER)
      }
      throw new Error(SupplierErrors.INTERNAL_ERROR)
    }
  }

  async updateSupplier(
    id: string,
    data: {
      name?: string
      location?: Supplier['location']
      isOperational?: boolean
      operatingHours?: Supplier['operatingHours']
      serviceTypes?: Supplier['serviceTypes']
    },
  ): Promise<Supplier> {
    // Check if supplier exists first
    const existing = await this.repository.findById(id)
    if (!existing) {
      throw new Error('Supplier not found')
    }

    const updated = await this.repository.update(id, {
      name: data.name,
      location: data.location,
      isOperational: data.isOperational,
      operatingHours: data.operatingHours,
      serviceTypes: data.serviceTypes,
    })

    void this.notifyErrandService(id, updated)

    return updated
  }

  async deleteSupplier(id: string): Promise<void> {
    const exists = await this.repository.findById(id)
    if (!exists) {
      throw new Error('Supplier not found')
    }

    await this.repository.delete(id)
  }

  async notifyErrandService(supplierId: string, updates: Partial<Supplier>): Promise<void> {
    const ERRAND_API_URL = process.env.ERRAND_API_URL || 'http://errand-api:3000'
    const ERRAND_SERVICE_INTERNAL_TOKEN =
      process.env.ERRAND_SERVICE_INTERNAL_TOKEN || 'local-internal-errand-service-token'

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(`${ERRAND_API_URL}/internal/errands/supplier-events`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-errand-service-token': ERRAND_SERVICE_INTERNAL_TOKEN,
          },
          body: JSON.stringify({
            supplierId,
            name: updates.name,
            location: updates.location,
            operatingHours: updates.operatingHours,
            isOperational: updates.isOperational,
            serviceTypes: updates.serviceTypes,
          }),
        })

        if (response.ok) {
          console.log(`Successfully notified Errand Service for supplier ${supplierId}`)
          return
        }

        console.error(
          `Errand notification attempt ${attempt} failed: ${response.status} ${response.statusText}`,
        )
      } catch (err) {
        console.error(`Errand notification attempt ${attempt} network error:`, err)
      }

      if (attempt < 3) {
        const delay = 1000 * Math.pow(2, attempt - 1)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    console.error(`Failed to notify Errand Service after 3 attempts for supplier ${supplierId}`)
  }
}
