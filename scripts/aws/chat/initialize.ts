// Run once as an ECS task command override, with the normal injected chat secret.
// Creates only the chat database and applies Prisma's additive initialization.
import { createRequire } from "node:module";

const require = createRequire(`${Deno.cwd()}/initialize.cjs`);
const { Client } = require(require.resolve("pg", {
    paths: [require.resolve("@prisma/orm-postgres/runtime")],
}));
const url = new URL(Deno.env.get("DATABASE_URL")!);
if (url.pathname !== "/chat") throw new Error("Initialization requires the chat database");
url.pathname = "/postgres";
const client = new Client({ connectionString: url.toString() });
await client.connect();
try {
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", ["chat"]);
    if (exists.rowCount === 0) {
        await client.query("CREATE DATABASE chat");
        console.log("Created chat database");
    } else {
        console.log("Chat database already exists; using additive schema initialization");
    }
} finally {
    await client.end();
}
for (const args of [["contract", "emit"], ["db", "init", "--no-interactive"], ["db", "verify"]]) {
    const command = new Deno.Command("deno", {
        args: ["run", "-A", "node_modules/prisma/dist/prisma.js", ...args],
        stdout: "inherit",
        stderr: "inherit",
    });
    const result = await command.output();
    if (!result.success) Deno.exit(result.code);
}
console.log("Chat schema initialization and verification passed");
