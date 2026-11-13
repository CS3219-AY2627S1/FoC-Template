import type { Context } from "@oak/oak";
import { defaultJwtService, type IJwtService } from "../util/jwt.ts";
import log from "../log.ts";

export interface AuthenticatedUser {
    id: number;
}

const reject = (ctx: Context, error: string) => {
    ctx.response.status = 401;
    ctx.response.body = { error };
    log.warn(`401 ${ctx.request.method} ${ctx.request.url.pathname}: ${error}`);
};

export interface AuthOptions {
    // also accept the token as ?token=... . Only for the image route, because an <img> tag cannot
    // send an Authorization header
    allowQueryToken?: boolean;
}

export const authenticationMiddlewareWithJwtProvider = (jwtService: IJwtService, options: AuthOptions = {}) =>
    async (ctx: Context, next: () => Promise<unknown>) => {
        const authHeader = ctx.request.headers.get("authorization");
        let token: string | null = null;
        if (authHeader?.startsWith("Bearer "))
            token = authHeader.slice("Bearer ".length).trim();
        else if (options.allowQueryToken)
            token = ctx.request.url.searchParams.get("token");
        if (!token) {
            reject(ctx, "missing bearer token");
            return;
        }

        const result = await jwtService.validateAccessToken(token);
        if (!result.success) {
            reject(ctx, result.error === "EXPIRED" ? "access token expired" : "access token is of invalid format");
            return;
        }

        const userId = Number(result.payload.sub);
        if (!Number.isInteger(userId)) {
            reject(ctx, "access token is of invalid format");
            return;
        }
        ctx.state.user = <AuthenticatedUser>{ id: userId };
        await next();
    };

/**
 * On success, the caller is in `ctx.state.user`
 * - `401` when the bearer token is missing, expired or malformed
 *
 * Any signed-in user passes: whether they may see a given chat depends on their relationship to
 * its errand (requester or courier), which the controller checks.
 */
export const authenticationMiddleware = (options: AuthOptions = {}) =>
    authenticationMiddlewareWithJwtProvider(defaultJwtService, options);
