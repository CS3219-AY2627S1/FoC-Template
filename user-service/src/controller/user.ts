import z, { ZodError } from "zod";
import type { IUserRepository } from "../prisma/users.ts";
import type { RouterContext } from "@oak/oak";
import { applyDbError, commonPasswordSchema } from "./common.ts";
import { type IRoleRepository } from "../prisma/roles.ts";
import type { JWTPayload } from "jose";
import config from "../config.ts";
import { type IPasswordHash } from "../util/hash.ts";
import { Role } from "../prisma/common.ts";
import log from "../log.ts";

const idReqSchema = z.coerce.number().int("expected valid id format");

export const userUpdateBasicSchema = z.object({
    nickname: z.string().max(config.user.nicknameMaxLength),
    // there is a digit (total length) limit defined by the e164 standard
    contact: z.e164().nullable(),
});

export const userUpdatePasswordSchema = z.object({
    existingPassword: z.string().max(128).optional(),
    newPassword: commonPasswordSchema,
});

export const userUpdateRoleSchema = z.partialRecord(z.enum(Role), z.boolean());

export const listUsersQuerySchema = z.object({
    name: z.string().trim().min(1).optional(),
    role: z.union([z.enum(Role), z.array(z.enum(Role))])
        .transform(value => [...new Set(Array.isArray(value) ? value : [value])])
        .default([]),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.coerce.number().int().positive().optional(),
}).strict();

export class UserController {
    userRepo: IUserRepository;
    roleRepo: IRoleRepository;
    hasher: IPasswordHash;

    constructor(userRepo: IUserRepository, roleRepo: IRoleRepository, hasher: IPasswordHash) {
        this.userRepo = userRepo;
        this.roleRepo = roleRepo;
        this.hasher = hasher;
    }

    validateIdCommon<R extends string>(ctx: RouterContext<R>, rawId: string): number | null {
        try {
            const parsedUserId = idReqSchema.parse(rawId);
            return parsedUserId
        } catch (e) {
            ctx.response.status = 400;
            if (e instanceof ZodError) {
                ctx.response.body = {
                    error: "url schema violation",
                    details: z.treeifyError(e)
                };
            }
            return null;
        }
    }

    /**
     * Admin-only: list a filtered page of users (public fields)
     * 
     * Infinite scrolling: request the next page with the same
     * filters and `cursor` set to `nextCursor`
     *
     * Role filter is an intersection (a user's roles must contain all specified roles)
     */
    async listUsers(ctx: RouterContext<"/">) {
        const query = ctx.state.validatedQuery as z.output<typeof listUsersQuerySchema>;
        try {
            log.debug(query);
            ctx.response.body = await this.userRepo.listUsers(query);
        } catch (e) {
            applyDbError(ctx, e);
        }
    }

    /**
     * If user is not an admin, reject access if they are accessing someone other than themselves
     */
    async getUser(ctx: RouterContext<"/:id">) {
        const { id } = ctx.params;
        const roles = ctx.state.jwtPayload.role as Role[];
        const requestingUserId = parseInt((<JWTPayload>ctx.state.jwtPayload).sub!);

        const parsedUserId = this.validateIdCommon(ctx, id);
        if (parsedUserId === null)
            return;

        // only allow self OR admin
        const isAdmin = roles.includes(Role.Admin);
        const isSelf = requestingUserId === parsedUserId;
        if (!isSelf && !isAdmin) {
            ctx.response.status = 403;
            ctx.response.body = { error: "insufficient permissions to get user" }
            return;
        }

        try {
            const userInfo = await this.userRepo.getUserByIdPublic(parsedUserId);
            if (!userInfo) {
                ctx.response.status = 404;
                ctx.response.body = { error: "no such user" };
                return;
            }
            ctx.response.body = userInfo;
        } catch (e) {
            applyDbError(ctx, e);
        }
    }

    /**
     * Handles only basic particulars (includes nickname and contact info)
     */
    async updateUserBasic(ctx: RouterContext<"/:id">) {
        const body = ctx.state.validatedBody as z.output<typeof userUpdateBasicSchema>;
        const { id } = ctx.params;
        const roles = ctx.state.jwtPayload.role as Role[];
        const requestingUserId = parseInt((<JWTPayload>ctx.state.jwtPayload).sub!);

        const parsedUserId = this.validateIdCommon(ctx, id);
        if (parsedUserId === null)
            return;

        // only allow self OR admin.
        // admin can change other admin particulars
        const isAdmin = roles.includes(Role.Admin);
        const isSelf = requestingUserId === parsedUserId;
        if (!isSelf && !isAdmin) {
            ctx.response.status = 403;
            ctx.response.body = { error: "insufficient permissions to update user" }
            return;
        }

        try {
            const updatedUserInfo = await this.userRepo.updateUserBasic(parsedUserId, body.nickname, body.contact);
            if (!updatedUserInfo) {
                ctx.response.status = 404;
                ctx.response.body = { error: "no such user" };
                return;
            }
            ctx.response.body = "updated";
        } catch (e) {
            applyDbError(ctx, e);
        }
    }


    /**
     * Allows admin to (un)assign others as admin
     * User should be disallowed from editing their own role
     * No user may not add/revoke their own admin role
     */
    async updateUserRole(ctx: RouterContext<"/:id/role">) {
        const body = ctx.state.validatedBody as z.output<typeof userUpdateRoleSchema>;
        const { id } = ctx.params;
        // const roles = ctx.state.jwtPayload.role as Role[];
        const requestingUserId = parseInt((<JWTPayload>ctx.state.jwtPayload).sub!);

        const parsedUserId = this.validateIdCommon(ctx, id);
        if (parsedUserId === null)
            return;

        // user may not add/revoke their own admin role
        const isSelf = requestingUserId === parsedUserId;
        if (isSelf && body[Role.Admin] !== undefined) {
            ctx.response.status = 403;
            ctx.response.body = { error: "cannot add or remove your own admin role" };
            return;
        }

        const toAdd = new Set<Role>();
        const toRemove = new Set<Role>();

        for (const [key, shouldAdd] of Object.entries(body)) {
            if (shouldAdd === undefined)
                continue;

            const role = key as Role;
            if (shouldAdd)
                toAdd.add(role);
            else
                toRemove.add(role);
        }

        try {
            // there is no mechanism for full user deletion, there should not be a race condition here
            const target = await this.userRepo.getUserByIdPublic(parsedUserId);
            if (!target) {
                ctx.response.status = 404;
                ctx.response.body = { error: "no such user" };
                return;
            }

            if (toAdd.size > 0)
                await this.roleRepo.assignRoles(parsedUserId, toAdd);
            if (toRemove.size > 0)
                await this.roleRepo.removeRoles(parsedUserId, toRemove);
            ctx.response.body = "updated";
        } catch (e) {
            applyDbError(ctx, e);
        }
    }

    // TODO: this seems out of place, can anyone verify the design or suggest something nicer?
    // we could shift this into the auth controller too
    /**
    * Password change flow:
    * - User: existing password, new password
    * - Admin: new password
    *
    * An admin can change the password without providing the old password.
    * This allows manual a password recovery mechanism without sending any email
     */
    async updateUserPassword(ctx: RouterContext<"/:id/change-password">) {
        const body = ctx.state.validatedBody as z.output<typeof userUpdatePasswordSchema>;
        const { id } = ctx.params;
        const roles = ctx.state.jwtPayload.role as Role[];
        const requestingUserId = parseInt((<JWTPayload>ctx.state.jwtPayload).sub!);

        const parsedUserId = this.validateIdCommon(ctx, id);
        if (parsedUserId === null)
            return;

        const isAdmin = roles.includes(Role.Admin);
        const isSelf = requestingUserId === parsedUserId;
        if (!isSelf && !isAdmin) {
            ctx.response.status = 403;
            ctx.response.body = { error: "insufficient permissions to update password" };
            return;
        }

        if (!isAdmin) {
            if (!body.existingPassword) {
                ctx.response.status = 400;
                ctx.response.body = { error: "existingPassword is required" };
                return;
            }

            try {
                const user = await this.userRepo.getUserByIdWithPassword(parsedUserId);
                if (!user) {
                    ctx.response.status = 404;
                    ctx.response.body = { error: "no such user" };
                    return;
                }

                const ok = await this.hasher.verifyPassword(user.hashedPassword, body.existingPassword);
                if (!ok) {
                    ctx.response.status = 401;
                    ctx.response.body = { error: "existing password is incorrect" };
                    return;
                }
            } catch (e) {
                applyDbError(ctx, e);
                return;
            }
        }

        try {
            const hashedPassword = await this.hasher.hashPassword(body.newPassword);
            const updated = await this.userRepo.updateUserPassword(parsedUserId, hashedPassword);

            if (!updated) {
                ctx.response.status = 404;
                ctx.response.body = { error: "no such user" };
                return;
            }

            ctx.response.body = "password updated";
        } catch (e) {
            applyDbError(ctx, e);
        }
    }

    async suspendUser(ctx: RouterContext<"/:id/suspend">) {
        await this.updateUserSuspension(ctx, true);
    }

    async unsuspendUser(ctx: RouterContext<"/:id/suspend">) {
        await this.updateUserSuspension(ctx, false);
    }

    /**
     * Admin-only: set suspension status. An admin may not suspend themselves.
     */
    private async updateUserSuspension(ctx: RouterContext<"/:id/suspend">, isSuspending: boolean) {
        const parsedUserId = this.validateIdCommon(ctx, ctx.params.id);
        if (parsedUserId === null)
            return;

        const requestingUserId = parseInt((<JWTPayload>ctx.state.jwtPayload).sub!);
        if (requestingUserId === parsedUserId) {
            ctx.response.status = 403;
            ctx.response.body = { error: "cannot suspend your own account" };
            return;
        }

        try {
            const updated = await this.userRepo.updateUserSuspension(parsedUserId, isSuspending);
            if (!updated) {
                ctx.response.status = 404;
                ctx.response.body = { error: "no such user" };
                return;
            }
            ctx.response.body = "updated";
        } catch (e) {
            applyDbError(ctx, e);
        }
    }

}
