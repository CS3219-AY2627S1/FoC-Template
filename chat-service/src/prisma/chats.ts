// All database access for chats. Every query is raw SQL with typed parameters (like the order
// service), so each state change is ONE statement and therefore atomic.
import { param } from "@prisma/orm-postgres/relational-core/expression";
import { db } from "./db.ts";

export type MessageType = "TEXT" | "IMAGE";
export type EndReason = "DELIVERED" | "CANCELLED";

export interface ChatSession {
    errandId: string;
    // both are known once order.created and order.accepted have been seen
    requesterId: number | null;
    courierId: number | null;
    endReason: EndReason | null;
    // ISO 8601; null while the errand is in progress
    deleteAt: string | null;
    requesterLastReadId: number;
    courierLastReadId: number;
    createdAt: string;
    updatedAt: string;
}

/** A message without its image bytes. */
export interface Message {
    id: number;
    errandId: string;
    senderId: number;
    type: MessageType;
    body: string | null;
    clientMessageId: string;
    createdAt: string;
}

/** A chat as one participant sees it: the session plus their unread count and the last message. */
export interface ChatSummary {
    session: ChatSession;
    unreadCount: number;
    lastMessage: Message | null;
}

const text = (v: string | null) => param(v, { codecId: "pg/text@1" });
const int = (v: number | null) => param(v, { codecId: "pg/int4@1" });

// postgres text "2026-10-11 17:24:26.326292+00" -> ISO 8601
const toIso = (ts: string) => new Date(ts.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")).toISOString();
const toIsoOrNull = (ts: string | null) => ts === null ? null : toIso(ts);

const ts = "pg/timestamptz-string@1";
const nullable = (codecId: string) => ({ codecId, nullable: true }) as const;

// ---- sessions ---------------------------------------------------------------------------

const sessionSpec = {
    errandId: "pg/text@1",
    requesterId: nullable("pg/int4@1"),
    courierId: nullable("pg/int4@1"),
    endReason: nullable("pg/text@1"),
    deleteAt: nullable(ts),
    requesterLastReadId: "pg/int4@1",
    courierLastReadId: "pg/int4@1",
    createdAt: ts,
    updatedAt: ts,
} as const;

type SessionRow = Omit<ChatSession, "endReason"> & { endReason: string | null };

const toSession = (row: SessionRow): ChatSession => ({
    ...row,
    endReason: <EndReason | null>row.endReason,
    deleteAt: toIsoOrNull(row.deleteAt),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
});

// every column in sessionSpec, for RETURNING
const sessionColumns = () => db.raw.sql`
    "errandId", "requesterId", "courierId", "endReason", "deleteAt",
    "requesterLastReadId", "courierLastReadId", "createdAt", "updatedAt"`.returns("pg/text@1");

/** order.created: remember who the requester is. Keeps the first value if it arrives twice. */
export const upsertRequester = async (errandId: string, requesterId: number): Promise<ChatSession> => {
    const plan = db.raw.sql`
        INSERT INTO chat_sessions ("errandId", "requesterId")
        VALUES (${text(errandId)}, ${int(requesterId)})
        ON CONFLICT ("errandId") DO UPDATE
            SET "requesterId" = COALESCE(chat_sessions."requesterId", EXCLUDED."requesterId"),
                "updatedAt" = now()
        RETURNING ${sessionColumns()}
    `.returnsRow(sessionSpec).build();
    const [row] = await db.runtime().query(plan);
    return toSession(<SessionRow>row);
};

/** order.accepted: remember the courier. The latest accept wins (an undone accept clears it first). */
export const upsertCourier = async (errandId: string, courierId: number): Promise<ChatSession> => {
    const plan = db.raw.sql`
        INSERT INTO chat_sessions ("errandId", "courierId")
        VALUES (${text(errandId)}, ${int(courierId)})
        ON CONFLICT ("errandId") DO UPDATE
            SET "courierId" = EXCLUDED."courierId", "updatedAt" = now()
        RETURNING ${sessionColumns()}
    `.returnsRow(sessionSpec).build();
    const [row] = await db.runtime().query(plan);
    return toSession(<SessionRow>row);
};

/**
 * order.completed / order.cancelled: the errand ended, so the chat is deleted `minutes` from
 * now. Only the first call has an effect (a repeated or late event changes nothing), and the
 * reason that came first is kept. Returns null if there is no such chat.
 */
export const markEnded = async (errandId: string, reason: EndReason, minutes: number): Promise<ChatSession | null> => {
    const plan = db.raw.sql`
        UPDATE chat_sessions
        SET "endReason" = COALESCE("endReason", ${text(reason)}),
            "deleteAt" = COALESCE("deleteAt", now() + ${int(Math.ceil(minutes))} * interval '1 minute'),
            "updatedAt" = now()
        WHERE "errandId" = ${text(errandId)}
        RETURNING ${sessionColumns()}
    `.returnsRow(sessionSpec).build();
    const [row] = await db.runtime().query(plan);
    return row ? toSession(<SessionRow>row) : null;
};

/** A chat that is still alive: not past its deletion time, even if the job has not run yet. */
export const findSession = async (errandId: string): Promise<ChatSession | null> => {
    const plan = db.raw.sql`
        SELECT ${sessionColumns()} FROM chat_sessions
        WHERE "errandId" = ${text(errandId)} AND ("deleteAt" IS NULL OR "deleteAt" > now())
    `.returnsRow(sessionSpec).build();
    const [row] = await db.runtime().query(plan);
    return row ? toSession(<SessionRow>row) : null;
};

export interface Participants {
    requesterId: number | null;
    courierId: number | null;
}

const participantsSpec = { requesterId: nullable("pg/int4@1"), courierId: nullable("pg/int4@1") } as const;

/** Deletes a chat and its messages in one statement. Returns who was in it, or null if it did not exist. */
export const deleteSession = async (errandId: string): Promise<Participants | null> => {
    const plan = db.raw.sql`
        WITH gone AS (
            DELETE FROM chat_sessions WHERE "errandId" = ${text(errandId)}
            RETURNING "requesterId", "courierId"
        ), msgs AS (
            DELETE FROM chat_messages WHERE "errandId" = ${text(errandId)} RETURNING id
        )
        SELECT "requesterId", "courierId" FROM gone
    `.returnsRow(participantsSpec).build();
    const [row] = await db.runtime().query(plan);
    return row ? <Participants>row : null;
};

/**
 * credits.accepted.rejected: the courier was refused, so the errand is OPEN again. The chat goes
 * back to "no courier yet" and anything said in it is deleted. Returns who was in it, or null.
 */
export const clearCourier = async (errandId: string): Promise<Participants | null> => {
    const plan = db.raw.sql`
        WITH old AS (
            SELECT "requesterId", "courierId" FROM chat_sessions
            WHERE "errandId" = ${text(errandId)} FOR UPDATE
        ), upd AS (
            UPDATE chat_sessions
            SET "courierId" = NULL, "endReason" = NULL, "deleteAt" = NULL,
                "requesterLastReadId" = 0, "courierLastReadId" = 0, "updatedAt" = now()
            WHERE "errandId" = ${text(errandId)} RETURNING 1
        ), msgs AS (
            DELETE FROM chat_messages WHERE "errandId" = ${text(errandId)} RETURNING 1
        )
        SELECT "requesterId", "courierId" FROM old
    `.returnsRow(participantsSpec).build();
    const [row] = await db.runtime().query(plan);
    return row ? <Participants>row : null;
};

export interface DeletedChat extends Participants { errandId: string }

/**
 * Retention job: deletes chats whose deletion time has passed, together with their messages, plus
 * empty chats that never got a courier and are older than `staleDays`. Returns what was deleted.
 */
export const deleteExpired = async (staleDays: number): Promise<DeletedChat[]> => {
    const plan = db.raw.sql`
        WITH gone AS (
            DELETE FROM chat_sessions
            WHERE ("deleteAt" IS NOT NULL AND "deleteAt" <= now())
                OR ("courierId" IS NULL AND "createdAt" < now() - ${int(Math.ceil(staleDays))} * interval '1 day')
            RETURNING "errandId", "requesterId", "courierId"
        ), msgs AS (
            DELETE FROM chat_messages WHERE "errandId" IN (SELECT "errandId" FROM gone) RETURNING id
        )
        SELECT "errandId", "requesterId", "courierId" FROM gone
    `.returnsRow({ errandId: "pg/text@1", ...participantsSpec }).build();
    return <DeletedChat[]>await db.runtime().query(plan);
};

// ---- chat list --------------------------------------------------------------------------

const chatSpec = {
    ...sessionSpec,
    unreadCount: "pg/int4@1",
    lastId: nullable("pg/int4@1"),
    lastSenderId: nullable("pg/int4@1"),
    lastType: nullable("pg/text@1"),
    lastBody: nullable("pg/text@1"),
    lastClientMessageId: nullable("pg/text@1"),
    lastCreatedAt: nullable(ts),
} as const;

type ChatRow = SessionRow & {
    unreadCount: number;
    lastId: number | null;
    lastSenderId: number | null;
    lastType: string | null;
    lastBody: string | null;
    lastClientMessageId: string | null;
    lastCreatedAt: string | null;
};

/**
 * The chats a user is in (both people known, not past deletion), most recently active first,
 * each with the user's unread count and the last message. Pass an errandId for just that chat.
 */
export const listChatsFor = async (userId: number, errandId: string | null = null): Promise<ChatSummary[]> => {
    const plan = db.raw.sql`
        SELECT s."errandId", s."requesterId", s."courierId", s."endReason", s."deleteAt",
            s."requesterLastReadId", s."courierLastReadId", s."createdAt", s."updatedAt",
            (SELECT count(*)::int FROM chat_messages m
                WHERE m."errandId" = s."errandId" AND m."senderId" <> ${int(userId)}
                    AND m.id > CASE WHEN s."requesterId" = ${int(userId)}
                        THEN s."requesterLastReadId" ELSE s."courierLastReadId" END) AS "unreadCount",
            lm.id AS "lastId", lm."senderId" AS "lastSenderId", lm.type AS "lastType",
            lm.body AS "lastBody", lm."clientMessageId" AS "lastClientMessageId",
            lm."createdAt" AS "lastCreatedAt"
        FROM chat_sessions s
        LEFT JOIN LATERAL (
            SELECT id, "senderId", type, body, "clientMessageId", "createdAt"
            FROM chat_messages m WHERE m."errandId" = s."errandId" ORDER BY m.id DESC LIMIT 1
        ) lm ON true
        WHERE s."requesterId" IS NOT NULL AND s."courierId" IS NOT NULL
            AND (s."requesterId" = ${int(userId)} OR s."courierId" = ${int(userId)})
            AND (s."deleteAt" IS NULL OR s."deleteAt" > now())
            AND (${text(errandId)}::text IS NULL OR s."errandId" = ${text(errandId)}::text)
        ORDER BY COALESCE(lm."createdAt", s."updatedAt") DESC, s."errandId" ASC
    `.returnsRow(chatSpec).build();
    const rows = <ChatRow[]>await db.runtime().query(plan);
    return rows.map(r => ({
        session: toSession(r),
        unreadCount: r.unreadCount,
        lastMessage: r.lastId === null ? null : {
            id: r.lastId,
            errandId: r.errandId,
            senderId: r.lastSenderId!,
            type: <MessageType>r.lastType,
            body: r.lastBody,
            clientMessageId: r.lastClientMessageId!,
            createdAt: toIso(r.lastCreatedAt!),
        },
    }));
};

/** Marks everything in the chat as read for this user (the sender of a message has read it). */
export const markRead = async (errandId: string, userId: number): Promise<void> => {
    const plan = db.raw.sql`
        UPDATE chat_sessions
        SET "requesterLastReadId" = CASE WHEN "requesterId" = ${int(userId)}
                THEN (SELECT COALESCE(max(id), 0) FROM chat_messages WHERE "errandId" = ${text(errandId)})
                ELSE "requesterLastReadId" END,
            "courierLastReadId" = CASE WHEN "courierId" = ${int(userId)}
                THEN (SELECT COALESCE(max(id), 0) FROM chat_messages WHERE "errandId" = ${text(errandId)})
                ELSE "courierLastReadId" END
        WHERE "errandId" = ${text(errandId)}
        RETURNING "errandId"
    `.returnsRow({ errandId: "pg/text@1" }).build();
    await db.runtime().query(plan);
};

// ---- messages ---------------------------------------------------------------------------

const messageSpec = {
    id: "pg/int4@1",
    errandId: "pg/text@1",
    senderId: "pg/int4@1",
    type: "pg/text@1",
    body: nullable("pg/text@1"),
    clientMessageId: "pg/text@1",
    createdAt: ts,
} as const;

type MessageRow = Omit<Message, "type"> & { type: string };

const toMessage = (row: MessageRow): Message => ({
    ...row,
    type: <MessageType>row.type,
    createdAt: toIso(row.createdAt),
});

// every column in messageSpec (never the image bytes), for SELECT and RETURNING
const messageColumns = () => db.raw.sql`
    id, "errandId", "senderId", type, body, "clientMessageId", "createdAt"`.returns("pg/text@1");

export interface NewMessage {
    errandId: string;
    senderId: number;
    type: MessageType;
    body: string | null;
    imageMime: string | null;
    // the image as base64 text
    imageData: string | null;
    clientMessageId: string;
}

/**
 * Saves a message. Returns null if nothing was saved: either the chat is gone (or not complete,
 * or past its deletion time), or a message with this clientMessageId already exists (a retry).
 * The chat check and the insert are one statement, so a message can never be saved into a chat
 * that the retention job just deleted.
 */
export const insertMessage = async (m: NewMessage): Promise<Message | null> => {
    const plan = db.raw.sql`
        INSERT INTO chat_messages ("errandId", "senderId", type, body, "imageMime", "imageData", "clientMessageId")
        SELECT ${text(m.errandId)}::text, ${int(m.senderId)}::int, ${text(m.type)}::text, ${text(m.body)}::text,
            ${text(m.imageMime)}::text, ${text(m.imageData)}::text, ${text(m.clientMessageId)}::text
        WHERE EXISTS (
            SELECT 1 FROM chat_sessions
            WHERE "errandId" = ${text(m.errandId)} AND "requesterId" IS NOT NULL AND "courierId" IS NOT NULL
                AND ("deleteAt" IS NULL OR "deleteAt" > now())
        )
        ON CONFLICT ("clientMessageId") DO NOTHING
        RETURNING ${messageColumns()}
    `.returnsRow(messageSpec).build();
    const [row] = await db.runtime().query(plan);
    return row ? toMessage(<MessageRow>row) : null;
};

export const findMessageByClientId = async (clientMessageId: string): Promise<Message | null> => {
    const plan = db.raw.sql`
        SELECT ${messageColumns()} FROM chat_messages WHERE "clientMessageId" = ${text(clientMessageId)}
    `.returnsRow(messageSpec).build();
    const [row] = await db.runtime().query(plan);
    return row ? toMessage(<MessageRow>row) : null;
};

/**
 * One page of a chat's messages, oldest first. Without `before` it is the newest `limit`
 * messages; with it, the `limit` messages just before that message id.
 */
export const listMessages = async (
    errandId: string, before: number | null, limit: number,
): Promise<{ data: Message[]; hasMore: boolean }> => {
    const plan = db.raw.sql`
        SELECT ${messageColumns()} FROM chat_messages
        WHERE "errandId" = ${text(errandId)} AND (${int(before)}::int IS NULL OR id < ${int(before)}::int)
        ORDER BY id DESC
        LIMIT ${int(limit + 1)}
    `.returnsRow(messageSpec).build();
    const rows = (<MessageRow[]>await db.runtime().query(plan)).map(toMessage);
    const hasMore = rows.length > limit;
    return { data: rows.slice(0, limit).reverse(), hasMore };
};

export interface StoredImage {
    errandId: string;
    mime: string;
    // base64 text
    data: string;
}

export const findImage = async (messageId: number): Promise<StoredImage | null> => {
    const plan = db.raw.sql`
        SELECT "errandId", "imageMime" AS mime, "imageData" AS data FROM chat_messages
        WHERE id = ${int(messageId)} AND type = 'IMAGE' AND "imageData" IS NOT NULL
    `.returnsRow({ errandId: "pg/text@1", mime: "pg/text@1", data: "pg/text@1" }).build();
    const [row] = await db.runtime().query(plan);
    return row ? <StoredImage>row : null;
};
