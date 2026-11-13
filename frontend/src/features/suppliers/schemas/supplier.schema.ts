import { z } from 'zod'
import { DAYS_OF_WEEK, SUPPLIER_CATEGORIES } from '../types/supplier.types'
import { toHourMinute } from '../utils/openingHours'
import type {
  OpeningHours,
  Supplier,
  SupplierRequest,
} from '../types/supplier.types'

const isTime = (value: string) => /^\d{2}:\d{2}$/.test(value)

// Keep the coordinate in text form
const coordinate = (min: number, max: number) =>
  z
    .string()
    .trim()
    .refine(
      (value) =>
        value === '' ||
        (Number.isFinite(Number(value)) &&
          Number(value) >= min &&
          Number(value) <= max),
      { message: `Must be a number between ${min} and ${max}.` },
    )

// One row per day of the week
// Times will be checked when marked open.
// A closing time earlier than the opening time means the supplier closes after midnight.
const dayHours = z
  .object({
    dayOfWeek: z.enum(DAYS_OF_WEEK),
    open: z.boolean(),
    opensAt: z.string(),
    closesAt: z.string(),
  })
  .superRefine((day, ctx) => {
    if (!day.open) return
    if (!isTime(day.opensAt)) {
      ctx.addIssue({ code: 'custom', path: ['opensAt'], message: 'Required.' })
    }
    if (!isTime(day.closesAt)) {
      ctx.addIssue({ code: 'custom', path: ['closesAt'], message: 'Required.' })
    } else if (day.opensAt === day.closesAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['closesAt'],
        message: 'Must differ from the opening time.',
      })
    }
  })

export const supplierSchema = z.object({
  name: z.string().trim().min(1, 'Please enter a name.').max(255),
  category: z.enum(SUPPLIER_CATEGORIES),
  building: z.string().trim().min(1, 'Please enter a building.').max(255),
  floor: z.string().trim().max(32),
  locationDescription: z.string().trim().max(500),
  hours: z
    .array(dayHours)
    .length(DAYS_OF_WEEK.length)
    .refine((days) => days.some((day) => day.open), {
      message: 'The supplier need to be open at least one day.',
    }),
  latitude: coordinate(-90, 90),
  longitude: coordinate(-180, 180),
})

export type SupplierFormValues = z.infer<typeof supplierSchema>

export type DayHoursFormValues = SupplierFormValues['hours'][number]

/** New suppliers default to weekdays 09:00 – 18:00, closed on weekends. */
export const emptySupplierForm: SupplierFormValues = {
  name: '',
  category: 'FOOD',
  building: '',
  floor: '',
  locationDescription: '',
  hours: DAYS_OF_WEEK.map((dayOfWeek) => ({
    dayOfWeek,
    open: dayOfWeek !== 'SATURDAY' && dayOfWeek !== 'SUNDAY',
    opensAt: '09:00',
    closesAt: '18:00',
  })),
  latitude: '',
  longitude: '',
}

export const toOpeningHours = (
  hours: Array<DayHoursFormValues>,
): Array<OpeningHours> =>
  hours
    .filter((day) => day.open)
    .map(({ dayOfWeek, opensAt, closesAt }) => ({
      dayOfWeek,
      opensAt,
      closesAt,
    }))

export const toSupplierFormValues = (
  supplier: Supplier,
): SupplierFormValues => ({
  name: supplier.name,
  category: supplier.category,
  building: supplier.building,
  floor: supplier.floor ?? '',
  locationDescription: supplier.locationDescription ?? '',
  hours: DAYS_OF_WEEK.map((dayOfWeek) => {
    const entry = supplier.openingHours.find(
      (hours) => hours.dayOfWeek === dayOfWeek,
    )
    return {
      dayOfWeek,
      open: Boolean(entry),
      opensAt: entry ? toHourMinute(entry.opensAt) : '09:00',
      closesAt: entry ? toHourMinute(entry.closesAt) : '18:00',
    }
  }),
  latitude: supplier.latitude?.toString() ?? '',
  longitude: supplier.longitude?.toString() ?? '',
})

const optional = (value: string) => (value === '' ? null : value)

const optionalNumber = (value: string) => (value === '' ? null : Number(value))

export const toSupplierRequest = ({
  hours,
  ...values
}: SupplierFormValues): SupplierRequest => ({
  ...values,
  floor: optional(values.floor),
  locationDescription: optional(values.locationDescription),
  latitude: optionalNumber(values.latitude),
  longitude: optionalNumber(values.longitude),
  openingHours: toOpeningHours(hours),
})
