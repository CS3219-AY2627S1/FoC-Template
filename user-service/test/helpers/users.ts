import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import request from "supertest";
import { afterAll, vi } from "vitest";
import { createApp } from "../../src/app.ts";
import { sendOtpMail } from "../../src/lib/mailer.ts";
import { hashPassword } from "../../src/lib/password.ts";
import { UserModel, type AccountState, type Role } from "../../src/models/user.model.ts";

// supertest would listen on "::" and then connect to 127.0.0.1, where on macOS another process
// can hold the same port and answer instead. So the app listens on 127.0.0.1 itself.
export const app = createServer(createApp()).listen(0, "127.0.0.1");
await once(app, "listening");
afterAll(() => new Promise((resolve) => app.close(resolve)));

export const PASSWORD = "correct-password";

type NewUser = { username?: string; roles?: Role[]; state?: AccountState };

// Creates an account straight in the database, skipping registration.
export async function createUser({ username = "alice", roles = ["member"], state = "Active" }: NewUser = {}) {
    const user = await UserModel.create({
        _id: randomUUID(),
        fullName: username,
        email: `${username.toLowerCase()}@u.nus.edu`,
        username,
        passwordHash: await hashPassword(PASSWORD),
        roles,
        state,
    });
    return user._id;
}

// Returns a supertest agent that keeps the session cookie, like a browser.
export async function loginAs(username: string, password = PASSWORD) {
    const agent = request.agent(app);
    await agent.post("/auth/login").send({ identifier: username, password }).expect(200);
    return agent;
}

export function sessionTokenOf(response: request.Response): string {
    const cookies = ([] as string[]).concat(response.headers["set-cookie"] ?? []);
    const cookie = cookies.find((value) => value.startsWith("relay_session="));
    return cookie?.split(";")[0]?.split("=")[1] ?? "";
}

export function lastCodeSentTo(email: string): string {
    const call = vi.mocked(sendOtpMail).mock.calls.findLast(([to]) => to === email);
    if (!call) throw new Error(`no code was sent to ${email}`);
    return call[1];
}