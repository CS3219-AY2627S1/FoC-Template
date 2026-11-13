// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-28
// Scope: Generated initial implementation of the Supplier Service controller.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import type { NextFunction, Request, Response } from 'express'
import { SupplierErrors } from '@relay/contracts/supplier'
import type {
  GetSuppliersFilterParams,
  ServiceType,
  ValidateSupplierSelectionRequest,
} from '@relay/contracts/supplier'
import { getEnv } from '../config/env.js'
import { SupplierService } from '../services/supplier.service.js'
import {
  validateLocation,
  validateOperatingHours,
  validateServiceTypes,
} from '../validators/supplier.validator.js'

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<globalThis.Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), getEnv().userApiTimeoutMs)

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

function checkAuth(req: Request): boolean {
  return req.user?.emailVerified === true
}

function parseFilters(
  query: Request['query'],
): { filters: GetSuppliersFilterParams } | { error: string } {
  const { status, serviceTypes } = query
  const filters: GetSuppliersFilterParams = {}

  if (status !== undefined) {
    if (status !== 'all' && status !== 'operational' && status !== 'not-operational') {
      return { error: 'Invalid status filter' }
    }
    filters.status = status as GetSuppliersFilterParams['status']
  }

  if (serviceTypes !== undefined) {
    let parsedServiceTypes: unknown
    try {
      parsedServiceTypes = JSON.parse(serviceTypes as string)
    } catch {
      parsedServiceTypes = undefined
    }
    if (
      !Array.isArray(parsedServiceTypes) ||
      !parsedServiceTypes.every((value) => typeof value === 'number')
    ) {
      return { error: 'Invalid serviceTypes filter' }
    }
    filters.serviceTypes = parsedServiceTypes as ServiceType[]
  }

  return { filters }
}

export class SupplierController {
  constructor(private readonly service: SupplierService) {}

  getAllSuppliers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authResult = await checkAuth(req)
      if (!authResult) {
        res
          .status(401)
          .json({ code: SupplierErrors.UNAUTHORIZED, message: 'Authentication required' })
        return
      }

      const parsed = parseFilters(req.query)
      if ('error' in parsed) {
        res.status(400).json({ code: SupplierErrors.INVALID_REQUEST, message: parsed.error })
        return
      }

      const suppliers = await this.service.getAllSuppliers(parsed.filters)
      res.json({ suppliers: suppliers })
    } catch (error) {
      next(error)
    }
  }

  validateSupplierSelection = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const body = req.body as Partial<ValidateSupplierSelectionRequest>
      if (!body || typeof body.supplierId !== 'string' || body.supplierId.trim() === '') {
        res.status(400).json({
          code: SupplierErrors.INVALID_REQUEST,
          message: 'supplierId is required',
        })
        return
      }
      if (body.serviceType !== undefined && typeof body.serviceType !== 'number') {
        res.status(400).json({
          code: SupplierErrors.INVALID_REQUEST,
          message: 'serviceType must be a number',
        })
        return
      }

      const result = await this.service.validateSupplierSelection({
        supplierId: body.supplierId.trim(),
        ...(body.serviceType !== undefined ? { serviceType: body.serviceType } : {}),
      })
      res.json(result)
    } catch (error) {
      next(error)
    }
  }

  getSupplierById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authResult = await checkAuth(req)
      if (!authResult) {
        res
          .status(401)
          .json({ code: SupplierErrors.UNAUTHORIZED, message: 'Authentication required' })
        return
      }

      const supplier = await this.service.getSupplierById(
        Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
      )
      if (!supplier) {
        res.status(404).json({ code: SupplierErrors.NOT_FOUND, message: 'Supplier not found' })
        return
      }
      res.json({ supplier: supplier })
    } catch (error) {
      next(error)
    }
  }

  createSupplier = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authResult = await checkAuth(req)
      if (!authResult) {
        res
          .status(401)
          .json({ code: SupplierErrors.UNAUTHORIZED, message: 'Authentication required' })
        return
      }

      const { name, location, isOperational, operatingHours, serviceTypes } = req.body

      if (!name || typeof name !== 'string' || name.trim() === '') {
        res.status(400).json({ code: SupplierErrors.INVALID_REQUEST, message: 'Name is required' })
        return
      }
      if (typeof isOperational !== 'boolean') {
        res
          .status(400)
          .json({ code: SupplierErrors.INVALID_REQUEST, message: 'isOperational is required' })
        return
      }

      const locationError = validateLocation(location)
      if (locationError) {
        res.status(400).json({ code: SupplierErrors.INVALID_REQUEST, message: locationError })
        return
      }

      const operatingHoursError = validateOperatingHours(operatingHours)
      if (operatingHoursError) {
        res.status(400).json({ code: SupplierErrors.INVALID_REQUEST, message: operatingHoursError })
        return
      }

      const serviceTypesError = validateServiceTypes(serviceTypes)
      if (serviceTypesError) {
        res.status(400).json({ code: SupplierErrors.INVALID_REQUEST, message: serviceTypesError })
        return
      }

      const supplier = await this.service.createSupplier({
        name,
        location,
        isOperational,
        operatingHours,
        serviceTypes,
      })

      res.status(201).json({ supplier: supplier })
    } catch (error: any) {
      if (error?.message === SupplierErrors.DUPLICATE_SUPPLIER) {
        res.status(409).json({
          code: SupplierErrors.DUPLICATE_SUPPLIER,
          message: 'A supplier with this name already exists at this location',
        })
        return
      }
      res.status(500).json({
        code: SupplierErrors.INTERNAL_ERROR,
        message: 'An unexpected error occurred',
      })
    }
  }

  updateSupplier = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authResult = await checkAuth(req)
      if (!authResult) {
        res
          .status(401)
          .json({ code: SupplierErrors.UNAUTHORIZED, message: 'Authentication required' })
        return
      }

      const { name, location, isOperational, operatingHours, serviceTypes } = req.body
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id

      const supplier = await this.service.updateSupplier(id, {
        name,
        location,
        isOperational,
        operatingHours,
        serviceTypes,
      })

      res.json({ supplier: supplier })
    } catch (error) {
      next(error)
    }
  }

  deleteSupplier = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authResult = await checkAuth(req)
      if (!authResult) {
        res
          .status(401)
          .json({ code: SupplierErrors.UNAUTHORIZED, message: 'Authentication required' })
        return
      }

      await this.service.deleteSupplier(
        Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
      )
      res.status(204).send()
    } catch (error) {
      next(error)
    }
  }
}
