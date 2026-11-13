// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-09-28
// Scope: Implemented author-defined Supplier CRUD and filtering repository behavior.
// Author review: Reviewed outputs, corrected phrasing and syntax, and adjusted implementation
// details to fit project requirements.

import {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from '../db.js'
import type { Supplier, GetSuppliersFilterParams } from '@relay/contracts/supplier'

export class SupplierRepository {
  async findAll(filters?: GetSuppliersFilterParams): Promise<Supplier[]> {
    const rows = await getSuppliers(filters)
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      location: row.location,
      isOperational: row.is_operational,
      operatingHours: row.operating_hours,
      serviceTypes: row.service_types,
    }))
  }

  async findById(id: string): Promise<Supplier | null> {
    const rows = await getSupplierById(id)
    if (!rows || rows.length === 0) return null
    return {
      id: rows[0].id,
      name: rows[0].name,
      location: rows[0].location,
      isOperational: rows[0].is_operational,
      operatingHours: rows[0].operating_hours,
      serviceTypes: rows[0].service_types,
    }
  }

  async create(data: {
    name: string
    location: Supplier['location']
    isOperational: boolean
    operatingHours: Supplier['operatingHours']
    serviceTypes: Supplier['serviceTypes']
  }): Promise<Supplier> {
    const row = await createSupplier(
      data.name,
      JSON.stringify(data.location),
      data.isOperational,
      JSON.stringify(data.operatingHours),
      data.serviceTypes,
    )
    return {
      id: row[0].id,
      name: row[0].name,
      location: row[0].location,
      isOperational: row[0].is_operational,
      operatingHours: row[0].operating_hours,
      serviceTypes: row[0].service_types,
    }
  }

  async update(
    id: string,
    data: {
      name?: string
      location?: Supplier['location']
      isOperational?: boolean
      operatingHours?: Supplier['operatingHours']
      serviceTypes?: Supplier['serviceTypes']
    },
  ): Promise<Supplier> {
    const row = await updateSupplier(
      id,
      data.name,
      data.location ? JSON.stringify(data.location) : undefined,
      data.isOperational,
      data.operatingHours ? JSON.stringify(data.operatingHours) : undefined,
      data.serviceTypes,
    )
    return {
      id: row[0].id,
      name: row[0].name,
      location: row[0].location,
      isOperational: row[0].is_operational,
      operatingHours: row[0].operating_hours,
      serviceTypes: row[0].service_types,
    }
  }

  async delete(id: string): Promise<boolean> {
    return await deleteSupplier(id)
  }
}
