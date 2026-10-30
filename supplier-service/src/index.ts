//This is where the express server lives
//To export app for local testing app.ts was created

//imports are evaluated before the module body, so .env must load from an import
//rather than a dotenv.config() call below: app pulls in modules that read env at import time
import 'dotenv/config';
import { app } from '@/app';
import pool from '@database/db';

const port = Number(process.env.PORT || 3002);
const host = process.env.HOST || '0.0.0.0';

const server = app.listen(port, host, () => {
    console.log(`Supplier Service is running on ${host}:${port}`)
})

// On stop, close the HTTP server, then the DB pool, so Node can exit.
const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n${signal} received — shutting down REST...`);
    server.close();
    try {
        await pool.end();
    } catch {
        // already closed by an earlier signal
    }
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
