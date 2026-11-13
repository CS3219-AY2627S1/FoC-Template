// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-22
// Scope: Generated initial implementation.
// Author review: I validated correctness and edited for style.

import { Day, ServiceType } from '@relay/contracts'
import type {
  CreateSupplierRequest,
  Supplier,
  SupplierApi,
  UpdateSupplierRequest,
} from '@relay/contracts'

const id = (value: string) => value

const seed: Array<
  [string, string, number, number, number, string, string, boolean, Supplier['serviceTypes']]
> = [
  [
    "Anna's x Soup Union",
    'Central Library',
    1,
    1.296444,
    103.773032,
    '09:00',
    '18:00',
    true,
    [ServiceType.Food],
  ],
  [
    'NUS Co-op',
    'Central Library',
    1,
    1.2967866,
    103.7732677,
    '09:00',
    '16:00',
    true,
    [ServiceType.Shopping],
  ],
  [
    'Printer @ Com 2',
    'Com 2',
    1,
    1.2938347,
    103.7744572,
    '00:00',
    '23:59',
    true,
    [ServiceType.Printing],
  ],
  ['Cool Spot', 'Com 2', 1, 1.2940156, 103.7738478, '09:00', '21:30', true, [ServiceType.Food]],
  ['InstaChef', 'Terrace', 1, 1.2938898, 103.7736305, '00:00', '23:59', true, [ServiceType.Food]],
  [
    'Cafe+ Robot Cafe',
    'Central Library',
    1,
    1.296444,
    103.773032,
    '00:00',
    '23:59',
    false,
    [ServiceType.Food],
  ],
  [
    'A Hot Hideout',
    "Prince George's Park",
    2,
    1.2908445,
    103.7770891,
    '11:00',
    '21:30',
    true,
    [ServiceType.Food],
  ],
  [
    'Arise and Shine',
    'Engineering Block E4',
    4,
    1.2991517,
    103.769064,
    '08:00',
    '18:00',
    true,
    [ServiceType.Food],
  ],
  [
    'Bakehaus / Aurea',
    'The Ridge',
    1,
    1.2946778,
    103.7707872,
    '08:00',
    '21:00',
    true,
    [ServiceType.Food],
  ],
  [
    'Central Square @ YIH',
    'Yusof Ishak House',
    1,
    1.2984401,
    103.7726256,
    '08:00',
    '20:00',
    false,
    [ServiceType.Food],
  ],
  [
    'Pasta Express',
    'Frontier',
    1,
    1.2947819,
    103.7704435,
    '09:30',
    '19:30',
    true,
    [ServiceType.Food],
  ],
  [
    'TOMORO COFFEE',
    'Hon Sui Sen Memorial Library',
    2,
    1.2931259,
    103.7719943,
    '08:15',
    '18:00',
    true,
    [ServiceType.Food],
  ],
  [
    'Octobox',
    "Prince George's Park",
    2,
    1.2904347,
    103.7787588,
    '00:00',
    '23:59',
    false,
    [ServiceType.Shopping],
  ],
  ['Smooy', 'COM3', 1, 1.2948308, 103.7716305, '11:00', '21:00', true, [ServiceType.Food]],
  [
    'Goh Bros E-Print Pte Ltd',
    'Yusof Ishak House',
    5,
    1.2984905,
    103.7720544,
    '09:00',
    '18:00',
    true,
    [ServiceType.Printing],
  ],
  [
    'Cheers Unmanned Convenience Store',
    'Engineering Block E3',
    4,
    1.2994341,
    103.7526298,
    '00:00',
    '23:59',
    true,
    [ServiceType.Shopping],
  ],
  [
    'Nami',
    'Innovation 4.0',
    1,
    1.2942982,
    103.7708813,
    '08:00',
    '17:30',
    false,
    [ServiceType.Food],
  ],
  [
    'Supersnacks',
    "Prince George's Park",
    1,
    1.2913847,
    103.7776367,
    '11:00',
    '02:00',
    true,
    [ServiceType.Food],
  ],
  [
    'Good Day Cafe',
    'Medicine + Science Library',
    1,
    1.2967989,
    103.7794336,
    '07:30',
    '18:30',
    true,
    [ServiceType.Food],
  ],
  [
    'The Coffee Roaster',
    'Blk AS8',
    1,
    1.296252229,
    103.7720926,
    '08:00',
    '17:30',
    false,
    [ServiceType.Food],
  ],
  [
    'he by He Brews',
    'Engineering Block EA',
    1,
    1.300566804,
    103.7707577,
    '08:00',
    '17:00',
    true,
    [ServiceType.Food],
  ],
]

const seedSuppliers: Supplier[] = seed.map(
  (
    [name, buildingName, floorNum, lat, lng, openingTime, closingTime, isOperational, serviceTypes],
    index,
  ) => ({
    id: id(`supplier-${index + 1}`),
    name,
    location: { lat, lng, buildingName, floorNumber: floorNum },
    isOperational,
    operatingHours: {
      openingTime,
      closingTime,
      daysOfWeek: [Day.Monday, Day.Tuesday, Day.Wednesday, Day.Thursday, Day.Friday],
    },
    serviceTypes,
  }),
)

function cloneSupplier(supplier: Supplier): Supplier {
  return {
    ...supplier,
    location: { ...supplier.location },
    operatingHours: {
      ...supplier.operatingHours,
      daysOfWeek: [...supplier.operatingHours.daysOfWeek],
    },
    serviceTypes: [...supplier.serviceTypes],
  }
}

export const mockSupplierApi: SupplierApi = {
  async getSuppliers(filters) {
    let suppliers = seedSuppliers
    if (filters?.status && filters.status !== 'all') {
      const target = filters.status === 'operational'
      suppliers = suppliers.filter((supplier) => supplier.isOperational === target)
    }
    // Backend handles empty serviceTypes filter (return all), but we still respect it for mock consistency
    if (filters?.serviceTypes && filters.serviceTypes.length > 0) {
      const selected = filters.serviceTypes
      // OR logic: supplier must have ANY of the selected service types
      suppliers = suppliers.filter((supplier) =>
        selected.some((type) => supplier.serviceTypes.includes(type)),
      )
    }
    return { suppliers: suppliers.map(cloneSupplier) }
  },
  async getSupplier(supplierId: string) {
    const supplier = seedSuppliers.find((candidate) => candidate.id === supplierId)
    if (!supplier) throw new Error('Supplier not found.')
    return { supplier: cloneSupplier(supplier) }
  },
  async addSupplier(request: CreateSupplierRequest) {
    const supplier: Supplier = { ...request, id: id(`supplier-${crypto.randomUUID()}`) }
    seedSuppliers.push(supplier)
    return { supplier: cloneSupplier(supplier) }
  },
  async updateSupplier(supplierId: string, request: UpdateSupplierRequest) {
    const index = seedSuppliers.findIndex((candidate) => candidate.id === supplierId)
    if (index < 0) throw new Error('Supplier not found.')
    seedSuppliers[index] = { ...seedSuppliers[index], ...request, id: supplierId }
    return { supplier: cloneSupplier(seedSuppliers[index]) }
  },
  async removeSupplier(supplierId: string) {
    const index = seedSuppliers.findIndex((candidate) => candidate.id === supplierId)
    if (index < 0) throw new Error('Supplier not found.')
    seedSuppliers.splice(index, 1)
  },
}
