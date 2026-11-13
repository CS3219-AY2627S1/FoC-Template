import { Application, Router } from "@oak/oak";
import chatRouter from "./routes/chat.ts";
import { connectDatabase } from "./prisma/db.ts";
import config from "./config.ts";
import log from "./log.ts";
import { connectRabbitMQ } from "./rabbitmq/client.ts";
import { handleWebSocket } from "./realtime/hub.ts";
import { runRetention } from "./tasks/retention.ts";

const port = Number(Deno.env.get("PORT") ?? 3000);

// ensure database is ready so that first request is not slow
await connectDatabase();

const publicRouter = new Router({ prefix: "/public" });

publicRouter.get("/health", ctx => {
    ctx.response.body = "ok";
});

publicRouter.use(chatRouter.routes());

const privateRouter = new Router({ prefix: "/private" });
// Add private endpoints (service-to-service) here later.

const app = new Application();

// anything unexpected becomes a JSON 500 instead of a plain-text error page
app.use(async (ctx, next) => {
    try {
        await next();
    } catch (e) {
        log.error(`unhandled error on ${ctx.request.method} ${ctx.request.url.pathname}: ${e} (origin: ${(<Error>e)?.stack})`);
        ctx.response.status = 500;
        ctx.response.body = { error: "unknown error" };
    }
});

app.use(publicRouter.routes());
app.use(publicRouter.allowedMethods());

app.use(privateRouter.routes());
app.use(privateRouter.allowedMethods());

// RabbitMQ: connect with retry in the background (no await: the HTTP server must start even if
// the broker is not ready yet)
void connectRabbitMQ();

// delete chats that are past their deletion time, even if nobody opens them
setInterval(() => {
    runRetention().catch(e => log.error(`retention job failed: ${e}`));
}, config.chat.cleanupIntervalMs);

log.info(`starting on port ${port} (chats are deleted ${config.chat.retentionMinutes} minutes after their errand ends)`);
await Deno.serve({ port }, (request, info) => {
    // the WebSocket is handled outside Oak: it is the only path that upgrades the connection
    if (request.headers.get("upgrade")?.toLowerCase() === "websocket" && new URL(request.url).pathname === "/public/ws")
        return handleWebSocket(request);
    const remoteAddr = info.remoteAddr;
    return app.handle(request, "hostname" in remoteAddr ? remoteAddr : undefined)
        .then(response => response ?? new Response("not found", { status: 404 }));
}).finished;
