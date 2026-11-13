// AI Assistance Disclosure: Claude Opus (Cursor), 2026-11-05.
// Prompt: improve index.ts to ensure supplier/order pub-sub works for the supplier cache.
// Scope: start and stop the supplier event publisher with the REST server.
// Author review: Approved by @sunpterodactyl, just added in events publishing  .
//This is where the express server lives
//To export app for local testing app.ts was created

//imports are evaluated before the module body, so .env must load from an import
//rather than a dotenv.config() call below: app pulls in modules that read env at import time
import 'dotenv/config';
import { app } from '@/app';
import pool from '@database/db';
import { startSupplierEvents, stopSupplierEvents } from '@/messaging/producer';

const port = Number(process.env.PORT || 3002);
const host = process.env.HOST || '0.0.0.0';

startSupplierEvents();

const server = app.listen(port, host, () => {
    console.log(`Supplier Service is running on ${host}:${port}`)
})

// On stop, close the HTTP server, the broker connection, then the DB pool, so Node can exit.
const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n${signal} received — shutting down REST...`);
    server.close();
    try {
        await stopSupplierEvents();
    } catch {
        // broker already gone
    }
    try {
        await pool.end();
    } catch {
        // already closed by an earlier signal
    }
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
