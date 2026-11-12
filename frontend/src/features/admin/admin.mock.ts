export type Supplier = {
  id: string
  name: string
  category: string
  building: string
  floor: string
  description: string
  openingTime: string
  closingTime: string
  imageUrl: string
}

export const sampleCategories = ['Food & drinks', 'Retail', 'Printing']
export const sampleBuildings = ['COM2', 'UTown', 'Central Library', 'Science']
export const sampleSuppliers: Supplier[] = [
  { id: 'supplier-1', name: 'Robot Café', category: 'Food & drinks', building: 'COM2', floor: '1', description: 'Coffee and a quick bite between classes.', openingTime: '08:00', closingTime: '18:00', imageUrl: '' },
  { id: 'supplier-2', name: 'NUS Co-op', category: 'Retail', building: 'Central Library', floor: '1', description: 'Campus essentials and stationery.', openingTime: '09:00', closingTime: '17:30', imageUrl: '' },
  { id: 'supplier-3', name: 'Campus Print', category: 'Printing', building: 'COM2', floor: '2', description: 'Print and collect your course notes.', openingTime: '08:30', closingTime: '18:00', imageUrl: '' },
  { id: 'supplier-4', name: 'Cool Spot', category: 'Food & drinks', building: 'UTown', floor: '1', description: 'Cold drinks and light snacks.', openingTime: '10:00', closingTime: '20:00', imageUrl: '' },
]

export const sampleErrands = [
  { id: 'ERR-1048', item: 'Two iced lattes', supplierId: 'supplier-1', requester: 'Jamie Tan', courier: 'Alex Lim', credits: 12, status: 'Accepted', building: 'UTown', created: '2026-11-04T01:10:00Z', accepted: '2026-11-04T01:15:00Z', expires: '2026-11-04T04:00:00Z', completed: null, failed: null, cancelled: null, reason: null },
  { id: 'ERR-1047', item: 'A4 lecture notes, 20 pages', supplierId: 'supplier-3', requester: 'Priya Nair', courier: null, credits: 8, status: 'Open', building: 'Science', created: '2026-11-04T01:00:00Z', accepted: null, expires: '2026-11-04T05:00:00Z', completed: null, failed: null, cancelled: null, reason: null },
  { id: 'ERR-1046', item: 'One notebook and two pens', supplierId: 'supplier-2', requester: 'Sarah Lee', courier: 'Wei Chen', credits: 10, status: 'Completed', building: 'COM2', created: '2026-11-03T03:00:00Z', accepted: '2026-11-03T03:10:00Z', expires: '2026-11-03T06:00:00Z', completed: '2026-11-03T04:00:00Z', failed: null, cancelled: null, reason: null },
  { id: 'ERR-1045', item: 'A bottle of iced tea', supplierId: 'supplier-4', requester: 'Daniel Ong', courier: 'Alex Lim', credits: 6, status: 'Failed', building: 'Central Library', created: '2026-11-03T02:00:00Z', accepted: '2026-11-03T02:05:00Z', expires: '2026-11-03T05:00:00Z', completed: null, failed: '2026-11-03T02:30:00Z', cancelled: null, reason: 'Requested item was out of stock.' },
  { id: 'ERR-1044', item: 'One hot coffee', supplierId: 'supplier-1', requester: 'Jamie Tan', courier: null, credits: 5, status: 'Cancelled', building: 'COM2', created: '2026-11-02T01:00:00Z', accepted: null, expires: '2026-11-02T04:00:00Z', completed: null, failed: null, cancelled: '2026-11-02T01:20:00Z', reason: null },
]
export type MockErrand = typeof sampleErrands[number]
