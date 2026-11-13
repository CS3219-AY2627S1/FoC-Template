import { DbError, ErrorType } from "./common.ts";
import { db, isTransaction, type DbTxUnion } from "./db.ts";
import Constants from "./constants.ts";

export type FavouriteRecord = NonNullable<typeof db.orm.public.Favourite._row>;
export type FavouriteKind = FavouriteRecord["kind"];

export interface NewFavourite {
    userId: number;
    kind: FavouriteKind;
    targetId: number;
    floor: number;
    room: string;
    label: string | null;
}

export interface IFavouriteRepository {
    listByUser(userId: number): Promise<FavouriteRecord[]>;
    /** Adds the bookmark, or returns the one already saved for the same place. Throws when the user is at `max`. */
    add(favourite: NewFavourite, max: number): Promise<{ favourite: FavouriteRecord; created: boolean }>;
    /** null when the bookmark does not exist or belongs to someone else */
    updateLabel(id: number, userId: number, label: string | null): Promise<FavouriteRecord | null>;
    /** false when the bookmark does not exist or belongs to someone else */
    remove(id: number, userId: number): Promise<boolean>;
    /** Drops the user's bookmarks with these ids, e.g. ones whose supplier was deleted */
    removeMany(userId: number, ids: number[]): Promise<void>;
}

const unknownError = (e: unknown) => new DbError({
    status: ErrorType.Unknown,
    isUserFault: false,
    message: `unknown error: ${e}`
});

export class FavouriteRepository implements IFavouriteRepository {
    db: DbTxUnion;

    constructor(db: DbTxUnion) {
        this.db = db;
    }

    private findSame(f: NewFavourite) {
        return this.db.orm.public.Favourite
            .where({ userId: f.userId, kind: f.kind, targetId: f.targetId, floor: f.floor, room: f.room })
            .first();
    }

    async listByUser(userId: number): Promise<FavouriteRecord[]> {
        try {
            return await this.db.orm.public.Favourite
                .where({ userId })
                .orderBy([f => f.createdAt.desc(), f => f.id.desc()])
                .all();
        } catch (e) {
            throw unknownError(e);
        }
    }

    async add(favourite: NewFavourite, max: number): Promise<{ favourite: FavouriteRecord; created: boolean }> {
        try {
            const existing = await this.findSame(favourite);
            if (existing)
                return { favourite: existing, created: false };

            // a soft cap: two adds at the same moment may both pass, which only goes one over
            const query = db.raw.sql`
                SELECT COUNT(*)::integer AS total FROM favourite WHERE "userId" = ${favourite.userId}
            `.returnsRow({ total: db.sql.public.favourite.columns.id }).build();
            const rows = isTransaction(this.db) ? await this.db.query(query) : await this.db.runtime().query(query);
            if (rows[0].total >= max) {
                throw new DbError({
                    status: ErrorType.ConstraintViolation,
                    isUserFault: true,
                    message: `you can save at most ${max} places, remove one first`
                });
            }

            const created = await this.db.orm.public.Favourite.create(favourite);
            return { favourite: created, created: true };
        } catch (e) {
            if (e instanceof DbError)
                throw e;
            if ((e as { sqlState?: string }).sqlState === Constants.uniqueConstraintViolated) {
                // the same place was saved by another request after the check above
                const existing = await this.findSame(favourite);
                if (existing)
                    return { favourite: existing, created: false };
            }
            throw unknownError(e);
        }
    }

    async updateLabel(id: number, userId: number, label: string | null): Promise<FavouriteRecord | null> {
        try {
            return await this.db.orm.public.Favourite.where({ id, userId }).update({ label });
        } catch (e) {
            throw unknownError(e);
        }
    }

    async remove(id: number, userId: number): Promise<boolean> {
        try {
            const deleted = await this.db.orm.public.Favourite.where({ id, userId }).delete();
            return deleted !== null;
        } catch (e) {
            throw unknownError(e);
        }
    }

    async removeMany(userId: number, ids: number[]): Promise<void> {
        if (ids.length === 0)
            return;
        try {
            await this.db.orm.public.Favourite.where(f => f.id.in(ids)).where({ userId }).delete();
        } catch (e) {
            throw unknownError(e);
        }
    }
}
