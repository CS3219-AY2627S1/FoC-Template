import { seedRoles } from "./roles.ts";

export async function seedEssential() {
    await seedRoles();
}
