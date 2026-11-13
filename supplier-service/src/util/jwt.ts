import * as jose from "jose";
import config from "../config.ts";

// the supplier service only verifies access tokens, it never issues them
const accessKey = new TextEncoder().encode(config.jwt.accessKey);

export type ValidationResult =
    { success: true; payload: jose.JWTPayload } |
    { success: false; error: "EXPIRED" | "INVALID" };

export interface IJwtService {
    validateAccessToken(token: string): Promise<ValidationResult>;
}

async function validateAccessToken(token: string): Promise<ValidationResult> {
    try {
        const { payload } = await jose.jwtVerify(token, accessKey, {
            algorithms: ["HS256"],
            issuer: config.jwt.issuer,
        });
        return { success: true, payload };
    } catch (e) {
        if (e instanceof jose.errors.JWTExpired)
            return { success: false, error: "EXPIRED" };
        return { success: false, error: "INVALID" };
    }
}

export const defaultJwtService: IJwtService = {
    validateAccessToken,
};
