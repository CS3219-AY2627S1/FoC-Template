// AI Assistance Disclosure:
// Tool: Gemini (model: 3.1 Pro), date: 2026-09-27
// Scope: Provided the SQL schema, AI was used to implement the types
// Author review: Code manually reviewed and verified

export interface Supplier {
  id: string;
  name: string;
  type: string;
  building: string;
  floor: string | null;
  location_description: string | null;
  latitude: number; 
  longitude: number;
  starting_time: string | null; 
  closing_time: string | null;
  image_url: string | null;
  is_active: boolean;
  is_favourite?: boolean;
  created_at: Date;
  updated_at: Date;
}

export type CreateSupplierDTO = Omit<
  Supplier, 
  'id' | 'created_at' | 'updated_at'
> & {
  is_active?: boolean;
};