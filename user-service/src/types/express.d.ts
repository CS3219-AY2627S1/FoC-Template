import type { Auth } from "../services/session.service.ts";

declare global {
    namespace Express {
        interface Request {
            auth?: Auth;
        }
    }
}

export {};