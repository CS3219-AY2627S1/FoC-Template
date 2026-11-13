import type { Context } from "@oak/oak";
import { defaultJwtService, type IJwtService } from "../util/jwt.ts";
import { fromRawRole, type Role } from "../common.ts";
import log from "../log.ts";
import { recordUserId } from "../telemetry/tracing.ts";

export interface AuthenticatedUser {
    id: number;
    roles: Role[];
}

const reject = (ctx: Context, status: 401 | 403, error: string, userId?: number) => {
    ctx.response.status = status;
    ctx.response.body = { error };
    // FR 4.3.2: log every rejection, winston writes asynchronously so this does not delay the response
    log.warn(`${status} ${ctx.request.method} ${ctx.request.url.pathname} user=${userId ?? "unknown"}: ${error}`);
};

export const authenticationMiddlewareWithJwtProvider = (jwtService: IJwtService, rolesRequired: ReadonlySet<Role>) =>
    async (ctx: Context, next: () => Promise<unknown>) => {
        const authHeader = ctx.request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            reject(ctx, 401, "missing bearer token");
            return;
        }

        const result = await jwtService.validateAccessToken(authHeader.slice("Bearer ".length).trim());
        if (!result.success) {
            reject(ctx, 401, result.error === "EXPIRED" ? "access token expired" : "access token is of invalid format");
            return;
        }

        const userId = Number(result.payload.sub);
        if (!Number.isInteger(userId)) {
            reject(ctx, 401, "access token is of invalid format");
            return;
        }
        const rawRoles = Array.isArray(result.payload.role) ? <unknown[]>result.payload.role : [];
        const roles = rawRoles
            .map(r => typeof r === "string" ? fromRawRole(r) : null)
            .filter(r => r !== null);

        const user: AuthenticatedUser = { id: userId, roles };
        ctx.state.user = user;
        recordUserId(user.id);

        if (new Set(rolesRequired).difference(new Set(roles)).size !== 0) {
            reject(ctx, 403, "insufficient permissions to perform action", userId);
            return;
        }
        await next();
    };

/**
 * On success, the caller is in `ctx.state.user`
 * - `401` when the bearer token is missing, expired or malformed
 * - `403` when the token lacks any of `rolesRequired`
 *
 * @param rolesRequired Token must have at least these roles to be authorised
 */
export const authenticationMiddleware = (rolesRequired: ReadonlySet<Role>) =>
    authenticationMiddlewareWithJwtProvider(defaultJwtService, rolesRequired);
