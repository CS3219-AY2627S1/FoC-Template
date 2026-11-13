export type Location = {
  lat: number
  lng: number
  buildingName: string
  floorNumber: number
}

export const ServiceType: { [key: string]: number } = {
  Food: 0,
  Drink: 1,
  Shopping: 2,
  Printing: 3,
  Parcel: 4,
} as const

export type ServiceType = (typeof ServiceType)[keyof typeof ServiceType]

export const Day = {
  Monday: 0,
  Tuesday: 1,
  Wednesday: 2,
  Thursday: 3,
  Friday: 4,
  Saturday: 5,
  Sunday: 6,
} as const

export type Day = (typeof Day)[keyof typeof Day]

export type OperatingHours = {
  /** Opening time in HH:mm format (24-hour) */
  openingTime: string
  /** Closing time in HH:mm format (24-hour) */
  closingTime: string
  /** Days of the week when the supplier is open */
  daysOfWeek: Day[]
}

export type Supplier = {
  /** Opaque identifier for this supplier record */
  id: string
  /** Name displayed to users (e.g., "NUS Food Court 1") */
  name: string
  /** Physical location of the supplier */
  location: Location
  /** Whether the supplier is currently accepting orders */
  isOperational: boolean
  /** Business hours when the supplier is available */
  operatingHours: OperatingHours
  /** List of service types this supplier offers */
  serviceTypes: ServiceType[]
}
