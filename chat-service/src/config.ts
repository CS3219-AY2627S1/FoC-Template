import "dotenv/config";

function required(name: string): string {
    const value = process.env[name];
    if (!value || value.trim().length === 0) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

/** A positive number from the environment, or the fallback when it is missing or not a number. */
function positiveNumber(name: string, fallback: number): number {
    const n = Number(Deno.env.get(name));
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

const dbConnectionString = Deno.env.get("DATABASE_URL");

const config = {
    shouldGenerateLogfile: false,
    jwt: {
        // shared with the user service, which signs the access tokens
        accessKey: required('JWT_ACCESS_SECRET'),
        issuer: 'user-service',
    },
    chat: {
        // a chat is deleted this long after its errand ends (delivered, cancelled or expired).
        // 180 = the 3 hours in the requirements; set CHAT_RETENTION_MINUTES=1 to show it in a demo
        retentionMinutes: positiveNumber("CHAT_RETENTION_MINUTES", 180),
        // how often the background job deletes chats that are past their deletion time
        cleanupIntervalMs: 15_000,
        // a chat that never got a courier (errand rejected, or never accepted) has no messages;
        // its empty row is removed after this many days
        staleSessionDays: 30,
        maxTextLength: 2000,
        maxImageBytes: 2 * 1024 * 1024,
        // messages per page in GET /chats/:errandId/messages
        defaultPageSize: 30,
        maxPageSize: 100,
    },
    // RABBITMQ_CONNECTION is what docker compose passes (host "rabbitmq")
    rabbitMqUrl: Deno.env.get("RABBITMQ_CONNECTION")?.trim() || Deno.env.get("RABBITMQ_URL")?.trim(),
    dbConnectionString,
};

export default config;
