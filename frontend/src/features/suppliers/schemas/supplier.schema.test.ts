import { describe, expect, it } from 'vitest'
import {
  emptySupplierForm,
  supplierSchema,
  toSupplierFormValues,
  toSupplierRequest,
} from './supplier.schema'
import type { Supplier } from '../types/supplier.types'

const validForm = {
  ...emptySupplierForm,
  name: 'Cool Spot',
  building: 'COM2',
}

describe('supplierSchema', () => {
  it('accepts a minimal supplier', () => {
    expect(supplierSchema.safeParse(validForm).success).toBe(true)
  })

  it('requires name and building', () => {
    const result = supplierSchema.safeParse(emptySupplierForm)
    const fields = result.error?.issues.map((issue) => issue.path[0])
    expect(fields).toEqual(expect.arrayContaining(['name', 'building']))
  })

  it('rejects out-of-range coordinates', () => {
    const result = supplierSchema.safeParse({ ...validForm, latitude: '91' })
    const fields = result.error?.issues.map((issue) => issue.path[0])
    expect(fields).toEqual(['latitude'])
  })
})

describe('opening hours', () => {
  const withMonday = (
    patch: Partial<(typeof validForm.hours)[number]>,
  ): typeof validForm => ({
    ...validForm,
    hours: validForm.hours.map((day) =>
      day.dayOfWeek === 'MONDAY' ? { ...day, ...patch } : day,
    ),
  })

  it('accepts hours that close after midnight', () => {
    expect(
      supplierSchema.safeParse(
        withMonday({ opensAt: '18:00', closesAt: '02:00' }),
      ).success,
    ).toBe(true)
  })

  it('rejects identical opening and closing times on an open day', () => {
    const result = supplierSchema.safeParse(
      withMonday({ opensAt: '09:00', closesAt: '09:00' }),
    )
    expect(result.error?.issues[0].path).toEqual(['hours', 0, 'closesAt'])
  })

  it('ignores the times of closed days', () => {
    expect(
      supplierSchema.safeParse(
        withMonday({ open: false, opensAt: '', closesAt: '' }),
      ).success,
    ).toBe(true)
  })

  it('needs at least one open day', () => {
    const result = supplierSchema.safeParse({
      ...validForm,
      hours: validForm.hours.map((day) => ({ ...day, open: false })),
    })
    expect(result.error?.issues[0].path).toEqual(['hours'])
  })
})

describe('supplier form conversion', () => {
  it('sends blank optional fields as null', () => {
    expect(toSupplierRequest(validForm)).toMatchObject({
      floor: null,
      locationDescription: null,
      latitude: null,
      longitude: null,
    })
  })

  it('converts coordinates to numbers', () => {
    expect(
      toSupplierRequest({
        ...validForm,
        latitude: '1.2948',
        longitude: '103.77',
      }),
    ).toMatchObject({ latitude: 1.2948, longitude: 103.77 })
  })

  it('rejects coordinates that are not numbers', () => {
    const result = supplierSchema.safeParse({ ...validForm, longitude: 'abc' })
    expect(result.error?.issues[0].path).toEqual(['longitude'])
  })

  it('only sends the days marked open', () => {
    const request = toSupplierRequest(validForm)
    expect(request.openingHours.map((day) => day.dayOfWeek)).toEqual([
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
    ])
    expect(request).not.toHaveProperty('hours')
  })

  it('fills all days from the API, marking missing ones closed', () => {
    const supplier: Supplier = {
      id: '1',
      ...toSupplierRequest(validForm),
      imageUrl: null,
      openingHours: [
        { dayOfWeek: 'FRIDAY', opensAt: '18:00:00', closesAt: '02:00:00' },
      ],
      active: true,
      createdAt: '',
      updatedAt: '',
    }
    const form = toSupplierFormValues(supplier)
    expect(form.hours).toHaveLength(7)
    expect(form.hours.find((day) => day.dayOfWeek === 'FRIDAY')).toEqual({
      dayOfWeek: 'FRIDAY',
      open: true,
      opensAt: '18:00',
      closesAt: '02:00',
    })
    expect(form.hours.find((day) => day.dayOfWeek === 'MONDAY')?.open).toBe(
      false,
    )
    expect(form.floor).toBe('')
  })
})
