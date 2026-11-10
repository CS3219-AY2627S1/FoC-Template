import config from "../config/config.js";
import { REFRESH_TOKEN_MAX_AGE } from "../constants/auth.constants.js";

export const refreshTokenCookieOptions = {
    httpOnly: true,
    secure: config.nodeEnv === "production",
    sameSite: "strict" as const,
    maxAge: REFRESH_TOKEN_MAX_AGE,
    signed: true,
};