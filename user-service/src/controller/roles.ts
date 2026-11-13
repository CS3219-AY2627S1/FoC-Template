import type { RouterContext } from "@oak/oak";
import type { IRoleRepository } from "../prisma/roles.ts";
import { applyDbError } from "./common.ts";

export class RoleController {
    roleRepo: IRoleRepository;
    
    constructor(roleRepo: IRoleRepository) {
        this.roleRepo = roleRepo;
    }

    /**
     * Admin-only: list all roles
     */
    async listRoles(ctx: RouterContext<"/">) {
        try {
            ctx.response.body = await this.roleRepo.listRoles();
        } catch (e) {
            applyDbError(ctx, e);
        }
    }
}
