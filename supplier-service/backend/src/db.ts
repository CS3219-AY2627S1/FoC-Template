// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-09-27
// Scope: Scaffolded PostgreSQL connection and query implementation for the existing Supplier design.
// Author review: Reviewed outputs, corrected phrasing and syntax, and adjusted implementation
// details to fit project requirements.

import { Pool } from 'pg'
import { readFileSync } from 'node:fs'
import type { SupplierRow } from './types/supplier.types.js'
import { SupplierErrors, type GetSuppliersFilterParams } from '@relay/contracts'

const POSTGRES_UNIQUE_VIOLATION = '23505'
const dbSslCaPath = process.env.DB_SSL_CA_PATH

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433'),
  database: process.env.DB_NAME || 'relay',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  ssl: dbSslCaPath
    ? { ca: readFileSync(dbSslCaPath, 'utf8'), rejectUnauthorized: true }
    : undefined,
})

export async function query<T>(text: string, params?: any[]): Promise<T[]> {
  const result = await pool.query(text, params)
  return result.rows as T[]
}

/** Builds the supplier filter WHERE clause and its bound params. Exported for the self-check. */
export function buildSupplierFilter(filters?: GetSuppliersFilterParams): {
  where: string
  params: any[]
} {
  // Empty serviceTypes (frontend sends nothing for empty) means no filter applied.
  // If frontend sends empty array, it means no service types selected - return empty result.
  if (filters?.serviceTypes?.length === 0) {
    return { where: 'FALSE', params: [] }
  }

  const conditions: string[] = []
  const params: any[] = []

  if (filters?.status && filters.status !== 'all') {
    params.push(filters.status === 'operational')
    conditions.push(`is_operational = $${params.length}`)
  }

  // serviceTypes is only present when non-empty (frontend filters it out)
  if (filters?.serviceTypes) {
    // Use && (overlap) to check if supplier's service_types overlaps with requested types
    params.push(filters.serviceTypes)
    conditions.push(`service_types && $${params.length}`)
  }

  return { where: conditions.join(' AND '), params }
}

export async function getSuppliers(filters?: GetSuppliersFilterParams): Promise<SupplierRow[]> {
  const { where, params } = buildSupplierFilter(filters)
  const clause = where ? ` WHERE ${where}` : ''
  return query<SupplierRow>(`SELECT * FROM suppliers${clause} ORDER BY name`, params)
}

export async function getSupplierById(id: string): Promise<SupplierRow[] | null> {
  const rows = await query<SupplierRow>('SELECT * FROM suppliers WHERE id = $1', [id])
  return rows.length > 0 ? rows : null
}

export async function createSupplier(
  name: string,
  location: string,
  isOperational: boolean,
  operatingHours: string,
  serviceTypes: number[],
): Promise<SupplierRow[]> {
  try {
    return await query<SupplierRow>(
      `INSERT INTO suppliers (name, location, is_operational, operating_hours, service_types)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, location, isOperational, operatingHours, serviceTypes],
    )
  } catch (error: any) {
    if (error?.code === POSTGRES_UNIQUE_VIOLATION) {
      throw new Error(SupplierErrors.DUPLICATE_SUPPLIER)
    }
    throw error
  }
}

export async function updateSupplier(
  id: string,
  name?: string,
  location?: string,
  isOperational?: boolean,
  operatingHours?: string,
  serviceTypes?: number[],
): Promise<SupplierRow[]> {
  const updates: string[] = []
  const params: any[] = []
  let paramIndex = 1

  if (name !== undefined) {
    updates.push(`name = $${paramIndex++}`)
    params.push(name)
  }
  if (location !== undefined) {
    updates.push(`location = $${paramIndex++}`)
    params.push(location)
  }
  if (isOperational !== undefined) {
    updates.push(`is_operational = $${paramIndex++}`)
    params.push(isOperational)
  }
  if (operatingHours !== undefined) {
    updates.push(`operating_hours = $${paramIndex++}`)
    params.push(operatingHours)
  }
  if (serviceTypes !== undefined) {
    updates.push(`service_types = $${paramIndex++}`)
    params.push(serviceTypes)
  }

  if (updates.length === 0) {
    const rows = await getSupplierById(id)
    return rows ?? []
  }

  params.push(id)
  const rows = await query<SupplierRow>(
    `UPDATE suppliers SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    params,
  )
  return rows
}

export async function deleteSupplier(id: string): Promise<boolean> {
  const result = await pool.query('DELETE FROM suppliers WHERE id = $1', [id])
  return (result.rowCount ?? 0) > 0
}
