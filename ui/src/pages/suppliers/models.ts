/*
AI Assistance Disclosure:
Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-09-21
Scope: Moved authentication session types to shared user models
Author review: I reviewed correctness and edited the changes to fit the project
*/

export type SupplierCategory = 'Food' | 'Shopping' | 'Printing' | 'Food/Coffee'

export type Supplier = {
  id: string
  name: string
  category: SupplierCategory
  building: string
  floor: number
  description: string
  lattitude: number
  longitude: number
  startingTime: string
  closingTime: string
  imageUrl: string | null
}

export type SupplierCreateRequest = Omit<Supplier, 'id'>
export type SupplierUpdateRequest = Partial<SupplierCreateRequest> & { id: string }
