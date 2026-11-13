// AI Assistance Disclosure:
// Tool: GitHub Copilot (Copilot SDK), date: 2026-11-08
// Scope: Added the supplier favourite state to the frontend Supplier type.
// Author review: Read through all code and verified through testing

export interface Supplier {
    id: string,
    name: string,
    type: string,
    building: string,
    floor: string,
    location_description: string,
    latitude: number,
    longitude: number,
    starting_time: string,
    closing_time: string,
    operatingHours: string,
    image_url: string | null,
    is_active: boolean,
    isFavourite: boolean,
    created_at: string,
    updated_at: string
}

export type Role = 'ADMIN' | 'REQUESTER' | 'COURIER'

export interface User {
    id: string,
    username: string,
    email: string,
    firstName: string,
    lastName: string,
    roles: Role[]
}

export interface AdminUser extends User {
    isActive: boolean
}

export interface UserRolesResponse {
    userId: string,
    roles: Role[]
}

export interface UserListResponse {
    users: AdminUser[],
    pagination: {
        page: number,
        limit: number,
        total: number,
        totalPages: number
    }
}