import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { spy } from "@std/testing/mock";
import { FavouriteController, type ISupplierLookup } from "../src/controller/favourite.ts";
import type { FavouriteRecord } from "../src/prisma/favourites.ts";
import { DbError, ErrorType } from "../src/prisma/common.ts";
import type { SupplierDetails } from "../src/util/supplierService.ts";
import { FakeCtx, makeFavouriteRepo, TEST_REQUESTOR_ID, USER_PAYLOAD } from "./util.ts";

const USER_ID = Number(TEST_REQUESTOR_ID);
const HEADERS = { authorization: "Bearer access" };

const favourite = (id: number, overrides: Partial<FavouriteRecord> = {}): FavouriteRecord => ({
    id, userId: USER_ID, kind: "SUPPLIER", targetId: id, floor: 0, room: "", label: null, createdAt: "", ...overrides,
});

const supplier = (id: number): SupplierDetails => ({
    id, name: `Supplier ${id}`, type: ["food"], floor: 1, locationId: 1, imageUrl: null, opensAt: null, closesAt: null,
});

// suppliers 1 and 2 and building 7 are live, the rest are gone
const liveLookup = (overrides: Partial<ISupplierLookup> = {}): ISupplierLookup => ({
    supplier: overrides.supplier ?? (async id => id <= 2 ? { status: "FOUND", value: supplier(id) } : { status: "GONE" }),
    locations: overrides.locations ?? (async () => new Map([[7, { id: 7, name: "Com 2" }]])),
});

describe("FavouriteController list", () => {
    it("returns live bookmarks with details and deletes ones whose place is gone", async () => {
        const removeMany = spy(async () => {});
        const repo = makeFavouriteRepo({
            listByUser: async () => [
                favourite(1),
                favourite(3),
                favourite(10, { kind: "LOCATION", targetId: 7, floor: 5, label: "Home" }),
                favourite(11, { kind: "LOCATION", targetId: 8, floor: 2 }),
            ],
            removeMany,
        });
        const controller = new FavouriteController(repo, liveLookup());
        const ctx = new FakeCtx({ jwtPayload: USER_PAYLOAD, headers: HEADERS });

        await controller.listFavourites(ctx.asCtx());

        const body = ctx.response.body as { data: { id: number; supplier?: unknown; location?: unknown }[] };
        assertEquals(body.data.map(f => f.id), [1, 10]);
        assertEquals(body.data[0].supplier, supplier(1));
        assertEquals(body.data[1].location, { id: 7, name: "Com 2" });
        assertEquals(removeMany.calls.map(c => c.args as unknown[]), [[USER_ID, [3, 11]]]);
    });

    it("keeps every bookmark when the supplier service cannot answer", async () => {
        const removeMany = spy(async () => {});
        const repo = makeFavouriteRepo({
            listByUser: async () => [favourite(3), favourite(11, { kind: "LOCATION", targetId: 8, floor: 2 })],
            removeMany,
        });
        const controller = new FavouriteController(repo, liveLookup({
            supplier: async () => ({ status: "UNAVAILABLE" }),
            locations: async () => null,
        }));
        const ctx = new FakeCtx({ jwtPayload: USER_PAYLOAD, headers: HEADERS });

        await controller.listFavourites(ctx.asCtx());

        const body = ctx.response.body as { data: { id: number; supplier?: unknown; location?: unknown }[] };
        assertEquals(body.data.map(f => [f.id, "supplier" in f ? f.supplier : f.location]), [[3, null], [11, null]]);
        assertEquals(removeMany.calls.map(c => c.args as unknown[]), [[USER_ID, []]]);
    });

    it("still lists bookmarks when removing dead ones fails", async () => {
        const repo = makeFavouriteRepo({
            listByUser: async () => [favourite(1), favourite(3)],
            removeMany: async () => { throw new Error("db down"); },
        });
        const controller = new FavouriteController(repo, liveLookup());
        const ctx = new FakeCtx({ jwtPayload: USER_PAYLOAD, headers: HEADERS });

        await controller.listFavourites(ctx.asCtx());

        assertEquals(ctx.response.status, 200);
        assertEquals((ctx.response.body as { data: { id: number }[] }).data.map(f => f.id), [1]);
    });
});

describe("FavouriteController add", () => {
    it("creates a supplier bookmark with floor 0 and returns 201", async () => {
        const add = spy(async () => ({ favourite: favourite(5, { targetId: 1 }), created: true }));
        const controller = new FavouriteController(makeFavouriteRepo({ add }), liveLookup());
        const ctx = new FakeCtx({ jwtPayload: USER_PAYLOAD, headers: HEADERS, validatedBody: { kind: "SUPPLIER", targetId: 1 } });

        await controller.addFavourite(ctx.asCtx());

        assertEquals(ctx.response.status, 201);
        assertEquals((add.calls[0].args as unknown[])[0], { userId: USER_ID, kind: "SUPPLIER", targetId: 1, floor: 0, room: "", label: null });
    });

    it("saves a building spot with its floor, room and name", async () => {
        const add = spy(async () => ({
            favourite: favourite(6, { kind: "LOCATION", targetId: 7, floor: 5, room: "#05-12", label: "Home" }),
            created: true,
        }));
        const controller = new FavouriteController(makeFavouriteRepo({ add }), liveLookup());
        const ctx = new FakeCtx({
            jwtPayload: USER_PAYLOAD,
            headers: HEADERS,
            validatedBody: { kind: "LOCATION", targetId: 7, floor: 5, room: "#05-12", label: "Home" },
        });

        await controller.addFavourite(ctx.asCtx());

        assertEquals((add.calls[0].args as unknown[])[0], { userId: USER_ID, kind: "LOCATION", targetId: 7, floor: 5, room: "#05-12", label: "Home" });
        assertEquals((ctx.response.body as { room: string | null }).room, "#05-12");
    });

    it("returns 200 with the existing bookmark when the place is already saved", async () => {
        const controller = new FavouriteController(makeFavouriteRepo({
            add: async () => ({ favourite: favourite(5, { kind: "LOCATION", targetId: 7, floor: 3 }), created: false }),
        }), liveLookup());
        const ctx = new FakeCtx({ jwtPayload: USER_PAYLOAD, headers: HEADERS, validatedBody: { kind: "LOCATION", targetId: 7, floor: 3 } });

        await controller.addFavourite(ctx.asCtx());

        assertEquals(ctx.response.status, 200);
        assertEquals((ctx.response.body as { id: number }).id, 5);
    });

    it("returns 404 for a deleted supplier and 503 when the supplier service is down, without saving", async () => {
        for (const [lookup, status] of [[liveLookup(), 404], [liveLookup({ supplier: async () => ({ status: "UNAVAILABLE" }) }), 503]] as const) {
            const controller = new FavouriteController(makeFavouriteRepo(), lookup);
            const ctx = new FakeCtx({ jwtPayload: USER_PAYLOAD, headers: HEADERS, validatedBody: { kind: "SUPPLIER", targetId: 9 } });

            await controller.addFavourite(ctx.asCtx());

            assertEquals(ctx.response.status, status);
        }
    });

    it("returns 400 once the user is at the limit", async () => {
        const controller = new FavouriteController(makeFavouriteRepo({
            add: async () => { throw new DbError({ status: ErrorType.ConstraintViolation, isUserFault: true, message: "limit" }); },
        }), liveLookup());
        const ctx = new FakeCtx({ jwtPayload: USER_PAYLOAD, headers: HEADERS, validatedBody: { kind: "SUPPLIER", targetId: 1 } });

        await controller.addFavourite(ctx.asCtx());

        assertEquals(ctx.response.status, 400);
        assertEquals(ctx.response.body, { error: "limit" });
    });
});

describe("FavouriteController update and remove", () => {
    it("only touches the signed-in user's bookmark and returns 404 otherwise", async () => {
        const remove = spy(async (id: number, _userId: number) => id === 5);
        const controller = new FavouriteController(makeFavouriteRepo({ remove }), liveLookup());

        const mine = new FakeCtx({ jwtPayload: USER_PAYLOAD, params: { id: "5" } });
        await controller.removeFavourite(mine.asCtx());
        const other = new FakeCtx({ jwtPayload: USER_PAYLOAD, params: { id: "6" } });
        await controller.removeFavourite(other.asCtx());

        assertEquals([mine.response.status, other.response.status], [204, 404]);
        assertEquals(remove.calls.map(c => c.args), [[5, USER_ID], [6, USER_ID]]);
    });

    it("renames a bookmark", async () => {
        const controller = new FavouriteController(makeFavouriteRepo({
            updateLabel: async (id, _userId, label) => favourite(id, { label }),
        }), liveLookup());
        const ctx = new FakeCtx({ jwtPayload: USER_PAYLOAD, params: { id: "5" }, validatedBody: { label: "Lab" } });

        await controller.updateFavourite(ctx.asCtx());

        assertEquals((ctx.response.body as { label: string }).label, "Lab");
    });

    it("returns 400 for an invalid id", async () => {
        const controller = new FavouriteController(makeFavouriteRepo(), liveLookup());
        const ctx = new FakeCtx({ jwtPayload: USER_PAYLOAD, params: { id: "abc" } });

        await controller.removeFavourite(ctx.asCtx());

        assertEquals(ctx.response.status, 400);
    });
});
