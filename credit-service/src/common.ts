// Roles must match the user service, which issues access tokens.
export enum Role {
    Admin = "admin",
    Requestor = "requestor",
    Courier = "courier",
}

export function fromRawRole(rawName: string): Role | null {
    return Object.values(Role).find(role => role === rawName) ?? null;
}
