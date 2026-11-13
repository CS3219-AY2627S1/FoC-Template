import type { RouterContext } from "@oak/oak";
import type { JWTPayload } from "jose";
import z from "zod";
import config from "../config.ts";
import log from "../log.ts";
import type { FavouriteRecord, IFavouriteRepository } from "../prisma/favourites.ts";
import { fetchLocations, lookupSupplier, type LocationDetails, type Lookup, type SupplierDetails } from "../util/supplierService.ts";
import { applyDbError } from "./common.ts";

const label = z.string().trim().max(config.favourite.labelMaxLength)
    .transform(s => s.length > 0 ? s : null)
    .nullable()
    .optional();

// the same floors the order service accepts: ground floor is 1, basements are negative, there is no floor 0
const floor = z.number().int().min(-10).max(100).refine(f => f !== 0, "There is no floor 0; ground floor is level 1");
// optional room/unit, as long as the order service allows; stored as "" when left out
const room = z.string().trim().max(50).nullable().optional().transform(r => r ?? "");

export const addFavouriteSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("SUPPLIER"), targetId: z.number().int().positive(), label }).strict(),
    z.object({ kind: z.literal("LOCATION"), targetId: z.number().int().positive(), floor, room, label }).strict(),
]);

export const updateFavouriteSchema = z.object({ label: label.unwrap() }).strict();

/** What the supplier service knows, injectable so tests need no supplier service */
export interface ISupplierLookup {
    supplier(id: number, authorization: string): Promise<Lookup<SupplierDetails>>;
    locations(authorization: string): Promise<Map<number, LocationDetails> | null>;
}

export const defaultSupplierLookup: ISupplierLookup = {
    supplier: lookupSupplier,
    locations: fetchLocations,
};

// a bookmark with its live details; supplier/location is null while the supplier service cannot say.
// room is null when there is none
export type FavouriteView = Omit<FavouriteRecord, "userId" | "room"> & {
    room: string | null;
    supplier?: SupplierDetails | null;
    location?: LocationDetails | null;
};

const toView = (f: FavouriteRecord): FavouriteView => ({
    id: f.id, kind: f.kind, targetId: f.targetId, floor: f.floor, room: f.room || null, label: f.label, createdAt: f.createdAt,
});

export class FavouriteController {
    favouriteRepo: IFavouriteRepository;
    lookup: ISupplierLookup;

    constructor(favouriteRepo: IFavouriteRepository, lookup: ISupplierLookup = defaultSupplierLookup) {
        this.favouriteRepo = favouriteRepo;
        this.lookup = lookup;
    }

    private userIdOf<R extends string>(ctx: RouterContext<R>) {
        return parseInt((<JWTPayload>ctx.state.jwtPayload).sub!);
    }

    private authorizationOf<R extends string>(ctx: RouterContext<R>) {
        return ctx.request.headers.get("authorization") ?? "";
    }

    private parseId(ctx: RouterContext<"/:id">): number | null {
        const id = Number(ctx.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            ctx.response.status = 400;
            ctx.response.body = { error: "bookmark id must be a positive integer" };
            return null;
        }
        return id;
    }

    /**
     * The signed-in user's bookmarks, newest first, each with its live supplier or building details.
     * Bookmarks whose supplier or building the supplier service says is gone are deleted here (lazy cleanup);
     * when the supplier service cannot answer, they are kept and returned without details.
     */
    async listFavourites(ctx: RouterContext<"/">) {
        const userId = this.userIdOf(ctx);
        const authorization = this.authorizationOf(ctx);
        try {
            const favourites = await this.favouriteRepo.listByUser(userId);

            const needsLocations = favourites.some(f => f.kind === "LOCATION");
            const [locations, suppliers] = await Promise.all([
                needsLocations ? this.lookup.locations(authorization) : Promise.resolve(null),
                // one lookup per bookmarked supplier; at most config.favourite.maxPerUser
                Promise.all(favourites.filter(f => f.kind === "SUPPLIER")
                    .map(async f => [f.id, await this.lookup.supplier(f.targetId, authorization)] as const)),
            ]);
            const supplierLookups = new Map(suppliers);

            const gone: number[] = [];
            const views: FavouriteView[] = [];
            for (const f of favourites) {
                if (f.kind === "SUPPLIER") {
                    const found = supplierLookups.get(f.id)!;
                    if (found.status === "GONE") {
                        gone.push(f.id);
                        continue;
                    }
                    views.push({ ...toView(f), supplier: found.status === "FOUND" ? found.value : null });
                } else {
                    // only a successful answer that leaves the building out counts as gone
                    if (locations && !locations.has(f.targetId)) {
                        gone.push(f.id);
                        continue;
                    }
                    views.push({ ...toView(f), location: locations?.get(f.targetId) ?? null });
                }
            }

            // best effort: if it fails, the dead bookmarks are left out now and retried on the next read
            try {
                await this.favouriteRepo.removeMany(userId, gone);
            } catch (e) {
                log.warn(`could not remove ${gone.length} dead bookmarks for user ${userId}: ${e}`);
            }
            ctx.response.body = { data: views };
        } catch (e) {
            applyDbError(ctx, e);
        }
    }

    /**
     * Bookmarks a live supplier, or a building and floor. Saving the same place again returns the
     * existing bookmark (200) instead of a duplicate (201 when new).
     */
    async addFavourite(ctx: RouterContext<"/">) {
        const body = ctx.state.validatedBody as z.output<typeof addFavouriteSchema>;
        const userId = this.userIdOf(ctx);
        const authorization = this.authorizationOf(ctx);

        // only places that exist now can be bookmarked
        let details: Pick<FavouriteView, "supplier" | "location">;
        if (body.kind === "SUPPLIER") {
            const found = await this.lookup.supplier(body.targetId, authorization);
            if (found.status !== "FOUND") {
                this.rejectLookup(ctx, found.status, "supplier");
                return;
            }
            details = { supplier: found.value };
        } else {
            const locations = await this.lookup.locations(authorization);
            const location = locations?.get(body.targetId);
            if (!location) {
                this.rejectLookup(ctx, locations ? "GONE" : "UNAVAILABLE", "building");
                return;
            }
            details = { location };
        }

        try {
            const { favourite, created } = await this.favouriteRepo.add({
                userId,
                kind: body.kind,
                targetId: body.targetId,
                floor: body.kind === "LOCATION" ? body.floor : 0,
                room: body.kind === "LOCATION" ? body.room : "",
                label: body.label ?? null,
            }, config.favourite.maxPerUser);
            ctx.response.status = created ? 201 : 200;
            ctx.response.body = { ...toView(favourite), ...details };
        } catch (e) {
            applyDbError(ctx, e);
        }
    }

    private rejectLookup<R extends string>(ctx: RouterContext<R>, status: "GONE" | "UNAVAILABLE", what: string) {
        if (status === "GONE") {
            ctx.response.status = 404;
            ctx.response.body = { error: `no such ${what}` };
        } else {
            ctx.response.status = 503;
            ctx.response.body = { error: "could not check the place right now, try again shortly" };
        }
    }

    /** Renames a bookmark; a blank or null label clears it */
    async updateFavourite(ctx: RouterContext<"/:id">) {
        const body = ctx.state.validatedBody as z.output<typeof updateFavouriteSchema>;
        const id = this.parseId(ctx);
        if (id === null)
            return;
        try {
            const updated = await this.favouriteRepo.updateLabel(id, this.userIdOf(ctx), body.label);
            if (!updated) {
                ctx.response.status = 404;
                ctx.response.body = { error: "no such bookmark" };
                return;
            }
            ctx.response.body = toView(updated);
        } catch (e) {
            applyDbError(ctx, e);
        }
    }

    async removeFavourite(ctx: RouterContext<"/:id">) {
        const id = this.parseId(ctx);
        if (id === null)
            return;
        try {
            if (!await this.favouriteRepo.remove(id, this.userIdOf(ctx))) {
                ctx.response.status = 404;
                ctx.response.body = { error: "no such bookmark" };
                return;
            }
            ctx.response.status = 204;
        } catch (e) {
            applyDbError(ctx, e);
        }
    }
}
