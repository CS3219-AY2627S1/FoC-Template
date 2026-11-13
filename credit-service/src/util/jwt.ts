import * as jose from "jose";
import config from "../config.ts";

export type ValidationResult =
    { success: true; payload: jose.JWTPayload } |
    { success: false; error: "EXPIRED" | "INVALID" };

export interface IJwtService {
    validateAccessToken(token: string): Promise<ValidationResult>;
}

async function validateAccessToken(token: string): Promise<ValidationResult> {
    const secret = config.jwt.accessKey;
    if (!secret) {
        throw new Error("Missing required environment variable: JWT_ACCESS_SECRET");
    }

    try {
        const { payload } = await jose.jwtVerify(token, new TextEncoder().encode(secret), {
            algorithms: ["HS256"],
            issuer: config.jwt.issuer,
        });
        return { success: true, payload };
    } catch (error) {
        if (error instanceof jose.errors.JWTExpired)
            return { success: false, error: "EXPIRED" };
        return { success: false, error: "INVALID" };
    }
}

export const defaultJwtService: IJwtService = { validateAccessToken };
