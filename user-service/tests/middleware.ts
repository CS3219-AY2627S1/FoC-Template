// AI assistance (27/9/2026): deepseek
// generated unit tests given mock functions and example tests. picked, cleaned up code and added some missing tests on top

import { describe, it } from "@std/testing/bdd";
import { Application, Router } from "@oak/oak";
import { assertEquals, assertRejects } from "@std/assert";
import { spy } from "@std/testing/mock";
import { validateBody, validateQuery } from "../src/middleware/schema.ts";
import { CtxOpts, FakeCtx, makeJwtService, makePublicUser, makeUserRepo } from "./util.ts";
import { JWTPayload } from "jose";
import { Role } from "../src/prisma/common.ts";
import { ValidationResult } from "../src/util/jwt.ts";
import { authenticationMiddlewareWithJwtProvider, currentRolesMiddleware } from "../src/middleware/auth.ts";import z from "zod";

const makeAuthCtx = (opts: CtxOpts = {}) => new FakeCtx({
    ...opts,
    headers: { ...opts.headers, authorization: `Bearer atoken` }
});

describe("authentication middleware", () => {
    const mockNext = () => spy(async (_ctx?: unknown) => {});

    it("returns 401 when authorization header is missing", async () => {
        const mw = authenticationMiddlewareWithJwtProvider(makeJwtService(), new Set());
        const ctx = new FakeCtx();
        const next = mockNext();

        await mw(ctx.asCtx(), next);

        assertEquals(ctx.response.status, 401);
        assertEquals(ctx.response.body, { error: "missing bearer token" });
        assertEquals(next.calls.length, 0);
    });

    it("returns 401 when authorization is not a Bearer token", async () => {
        const mw = authenticationMiddlewareWithJwtProvider(makeJwtService(), new Set());
        const ctx = new FakeCtx({ headers: { authorization: "not a bearer" } });
        const next = mockNext();

        await mw(ctx.asCtx(), next);

        assertEquals(ctx.response.status, 401);
        assertEquals(ctx.response.body, { error: "missing bearer token" });
        assertEquals(next.calls.length, 0);
    });

    it("returns 401 when the access token is expired", async () => {
        const jwtService = makeJwtService({
            validateAccessToken: async () =>
                ({ success: false, error: "EXPIRED" }) as never,
        });
        const mw = authenticationMiddlewareWithJwtProvider(jwtService, new Set());
        const ctx = makeAuthCtx();
        const next = mockNext();

        await mw(ctx.asCtx(), next);

        assertEquals(ctx.response.status, 401);
        assertEquals(ctx.response.body, { error: "access token expired" });
        assertEquals(next.calls.length, 0);
    });

    it("returns 401 when the access token is invalid", async () => {
        const jwtService = makeJwtService({
            validateAccessToken: async () => ({ success: false, error: "INVALID" }),
        });
        const mw = authenticationMiddlewareWithJwtProvider(jwtService, new Set());
        const ctx = makeAuthCtx();
        const next = mockNext();

        await mw(ctx.asCtx(), next);

        assertEquals(ctx.response.status, 401);
        assertEquals(ctx.response.body, { error: "access token is of invalid format" });
        assertEquals(next.calls.length, 0);
    });

    it("returns 403 when the user lacks a required role", async () => {
        const jwtService = makeJwtService({
            validateAccessToken: async () => ({ success: true, payload: { sub: "1", role: [] } }) as never
        });
        const mw = authenticationMiddlewareWithJwtProvider(jwtService, new Set([Role.Admin]));
        const ctx = makeAuthCtx();
        const next = mockNext();

        await mw(ctx.asCtx(), next);

        assertEquals(ctx.response.status, 403);
        assertEquals(ctx.response.body, { error: "insufficient permissions to perform action" });
        assertEquals(next.calls.length, 0);
    });

    it("calls next and populates ctx.state.jwtPayload when roles suffice", async () => {
        const validRoles = [Role.Admin, Role.Courier];
        const jwtService = makeJwtService({
            validateAccessToken: async () => ({ success: true, payload: { sub: "1", role: validRoles } }) as never
        });
        const mw = authenticationMiddlewareWithJwtProvider(jwtService, new Set([Role.Admin]));
        const ctx = makeAuthCtx();
        const next = mockNext();

        await mw(ctx.asCtx(), next);

        const payload = ctx.state.jwtPayload as JWTPayload;
        assertEquals(payload.sub, "1");
        assertEquals(payload.role, validRoles);
        assertEquals(next.calls.length, 1);
    });

    it("drops unknown roles from the raw payload", async () => {
        const validRoles = [Role.Admin, Role.Courier];
        const jwtWithInvalidRole: ValidationResult = {
            success: true,
            payload: { sub: "1", role: [...validRoles, "something invalid"] },
        } as never;
        const jwtService = makeJwtService({
            validateAccessToken: async () => jwtWithInvalidRole,
        });
        const mw = authenticationMiddlewareWithJwtProvider(jwtService, new Set());
        const ctx = makeAuthCtx();
        const next = mockNext();

        await mw(ctx.asCtx(), next);

        assertEquals(next.calls.length, 1);
        assertEquals((ctx.state.jwtPayload as JWTPayload).role, validRoles);
    });
});

describe("current roles middleware", () => {
    // the token was issued while the caller was an admin
    const makeAdminTokenCtx = () => new FakeCtx({ jwtPayload: { sub: "1", role: [Role.Admin] } });

    it("calls next when the caller is still an admin in the database", async () => {
        const getUserByIdPublic = spy(async () => makePublicUser(1, { roles: [Role.Admin, Role.Courier] }));
        const mw = currentRolesMiddleware(makeUserRepo({ getUserByIdPublic }), new Set([Role.Admin]));
        const ctx = makeAdminTokenCtx();
        const next = spy(async () => {});

        await mw(ctx.asCtx(), next);

        assertEquals(getUserByIdPublic.calls[0].args, [1]);
        assertEquals(next.calls.length, 1);
    });

    it("returns 403 when the caller was demoted after the token was issued", async () => {
        const mw = currentRolesMiddleware(
            makeUserRepo({ getUserByIdPublic: async () => makePublicUser(1, { roles: [Role.Requestor] }) }),
            new Set([Role.Admin]),
        );
        const ctx = makeAdminTokenCtx();
        const next = spy(async () => {});

        await mw(ctx.asCtx(), next);

        assertEquals(ctx.response.status, 403);
        assertEquals(ctx.response.body, { error: "insufficient permissions to perform action" });
        assertEquals(next.calls.length, 0);
    });

    it("returns 403 when the caller was suspended after the token was issued", async () => {
        const mw = currentRolesMiddleware(
            makeUserRepo({ getUserByIdPublic: async () => makePublicUser(1, { roles: [Role.Admin], isSuspended: true }) }),
            new Set([Role.Admin]),
        );
        const ctx = makeAdminTokenCtx();
        const next = spy(async () => {});

        await mw(ctx.asCtx(), next);

        assertEquals(ctx.response.status, 403);
        assertEquals(ctx.response.body, { error: "your account has been suspended" });
        assertEquals(next.calls.length, 0);
    });

    it("returns 403 when the caller no longer exists", async () => {
        const mw = currentRolesMiddleware(makeUserRepo({ getUserByIdPublic: async () => null }), new Set([Role.Admin]));
        const ctx = makeAdminTokenCtx();
        const next = spy(async () => {});

        await mw(ctx.asCtx(), next);

        assertEquals(ctx.response.status, 403);
        assertEquals(next.calls.length, 0);
    });

    it("returns 500 when the lookup fails", async () => {
        const mw = currentRolesMiddleware(
            makeUserRepo({ getUserByIdPublic: async () => { throw new Error("db down"); } }),
            new Set([Role.Admin]),
        );
        const ctx = makeAdminTokenCtx();
        const next = spy(async () => {});

        await mw(ctx.asCtx(), next);

        assertEquals(ctx.response.status, 500);
        assertEquals(next.calls.length, 0);
    });
});

describe("body schema validation middleware", () => {
    const schema = z.object({ name: z.string() });

    it("returns 400 when the request has no body", async () => {
        const mw = validateBody(schema);
        const ctx = new FakeCtx();
        const next = spy(async () => {});

        await mw(ctx.asCtx(), next);

        assertEquals(ctx.response.status, 400);
        assertEquals(ctx.response.body, { error: "request body expected" });
        assertEquals(next.calls.length, 0);
    });

    it("returns 400 when the body is invalid json", async () => {
        const mw = validateBody(schema);
        const ctx = new FakeCtx({ bodyJson: new Error("invalid json") });
        const next = spy(async () => {});

        await mw(ctx.asCtx(), next);

        assertEquals(ctx.response.status, 400);
        assertEquals(ctx.response.body, { error: "request expected json body" });
        assertEquals(next.calls.length, 0);
    });

    it("returns 400 with details when schema validation fails", async () => {
        const mw = validateBody(schema);
        const ctx = new FakeCtx({ bodyJson: { name: 123 } });
        const next = spy(async () => {});

        await mw(ctx.asCtx(), next);

        assertEquals(ctx.response.status, 400);
        const body = ctx.response.body as { error: string; details?: unknown };
        assertEquals(body.error, "request schema violation");
        assertEquals(typeof body.details, "object");
        assertEquals(next.calls.length, 0);
    });

    it("stores the parsed body and transitions to next middleware", async () => {
        const mw = validateBody(schema);
        const ctx = new FakeCtx({ bodyJson: { name: "hello" } });
        const next = spy(async () => {});

        await mw(ctx.asCtx(), next);

        assertEquals(next.calls.length, 1);
        assertEquals(ctx.state.validatedBody, { name: "hello" });
        assertEquals(ctx.response.status, 200);
    });
});

describe("query schema validation middleware", () => {
    const schema = z.object({
        name: z.string().trim().min(1).optional(),
        limit: z.coerce.number().int().positive("expected positive limit").default(20),
    }).strict();

    it("parses a required limit and repeated roles from real Oak requests without a default", async () => {
        const querySchema = z.object({
            limit: z.coerce.number().int().min(1).max(100),
            role: z.array(z.enum(Role)).optional(),
        }).strict();
        const app = new Application();
        const router = new Router();
        router.get("/user/", validateQuery(querySchema), ctx => {
            ctx.response.body = ctx.state.validatedQuery;
        });
        app.use(router.routes());

        const response = await app.handle(new Request("http://localhost/user/?limit=2"));

        assertEquals(response?.status, 200);
        assertEquals(await response?.json(), { limit: 2 });

        const repeated = await app.handle(new Request("http://localhost/user/?limit=2&role=admin&role=courier"));

        assertEquals(repeated?.status, 200);
        assertEquals(await repeated?.json(), { limit: 2, role: [Role.Admin, Role.Courier] });
    });

    it("reports a missing required limit when the query string never reaches Oak", async () => {
        const app = new Application();
        const router = new Router();
        router.get("/user/", validateQuery(z.object({ limit: z.coerce.number().int().positive() })), ctx => {
            ctx.response.body = ctx.state.validatedQuery;
        });
        app.use(router.routes());

        const response = await app.handle(new Request("http://localhost/user/"));

        assertEquals(response?.status, 400);
        const body = await response?.json();
        assertEquals(body.error, "query schema violation");
        assertEquals(body.details.properties.limit.errors, ["Invalid input: expected number, received NaN"]);
    });

    it("stores transformed query values before calling the next middleware", async () => {
        const mw = validateQuery(schema);
        const ctx = new FakeCtx({ url: "http://localhost/?name=%20Ann%20&limit=5" });
        const next = spy(async () => {
            assertEquals(ctx.state.validatedQuery, { name: "Ann", limit: 5 });
        });

        await mw(ctx.asCtx(), next);

        assertEquals(ctx.response.status, 200);
        assertEquals(next.calls.length, 1);
        assertEquals(ctx.state.validatedBody, undefined);
    });

    it("treats repeated keys as arrays", async () => {
        const mw = validateQuery(z.object({ tag: z.array(z.string()), name: z.string() }));
        const ctx = new FakeCtx({ url: "http://localhost/?tag=first&name=Ann&tag=second&tag=first" });
        const next = spy(async () => {});

        await mw(ctx.asCtx(), next);

        assertEquals(ctx.state.validatedQuery, { tag: ["first", "second", "first"], name: "Ann" });
        assertEquals(next.calls.length, 1);
    });

    it("returns 400 with field details when validation fails", async () => {
        const mw = validateQuery(schema);
        const ctx = new FakeCtx({ url: "http://localhost/?limit=0" });
        const next = spy(async () => {});

        await mw(ctx.asCtx(), next);

        assertEquals(ctx.response.status, 400);
        assertEquals(ctx.response.body, {
            error: "query schema violation",
            details: {
                errors: [],
                properties: { limit: { errors: ["expected positive limit"] } },
            },
        });
        assertEquals(ctx.state.validatedQuery, undefined);
        assertEquals(next.calls.length, 0);
    });
});
