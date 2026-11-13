import postgres from "@prisma/orm-postgres/runtime";

import type { Contract } from "./contract.d.ts";
import contractJson from "./contract.json" with { type: "json" };
import log from "../log.ts";
import config from "../config.ts";

const databaseUrl = config.dbConnectionString;
if (!databaseUrl) {
    log.warn("DATABASE_URL is not set, no connection to the database will be made");
  // throw new Error("DATABASE_URL is not set. Add it to .env before starting the app.");
}

export const db = postgres<Contract>({ contractJson, url: databaseUrl });

let connection: Promise<void> | undefined;

// ensure connection happens, invocation not required due to lazy db init
export function connectDatabase(): Promise<void> {
    if (!databaseUrl)
        return Promise.resolve();
    connection ??= db.connect().then(() => undefined).catch((error: unknown) => {
        connection = undefined;
        throw error;
    });
    return connection;
}
