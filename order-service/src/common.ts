// roles are owned by the user service, these must match its Role enum
export enum Role {
    Admin = "admin",
    Requestor = "requestor",
    Courier = "courier",
}

export function fromRawRole(rawName: string): Role | null {
    return Object.values(Role).find(r => r === rawName) ?? null;
}

