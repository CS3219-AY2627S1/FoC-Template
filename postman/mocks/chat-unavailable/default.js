/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-08
 * Scope: Added a local HTTP failure stand-in for worker verification.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Added synthetic participant 503 then 409 responses.
 * Author review: tng wen xi
 */
const http = require("node:http");
let participantCalls = 0;
http
  .createServer((req, res) => {
    req.resume();
    const isCreation =
      req.method === "POST" && req.url === "/chat/conversations";
    const isParticipant =
      req.method === "POST" &&
      /^\/chat\/orders\/[^/]+\/participants$/.test(req.url);
    const status = isCreation
      ? 503
      : isParticipant
        ? ++participantCalls === 1
          ? 503
          : 409
        : 501;
    res.writeHead(status, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        message: isCreation
          ? "Service unavailable"
          : "Not implemented by this stand-in",
      }),
    );
  })
  .listen(process.env.PORT);
