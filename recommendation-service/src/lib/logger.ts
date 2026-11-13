import { pino } from "pino";
import { config } from "../config.ts";

export const logger = pino({
    level: config.LOG_LEVEL,
    redact: {
        paths: [
            "req.headers.cookie",
            "req.headers.authorization",
            "*.password",
            "*.token",
        ],
        censor: "[redacted]"
    }
})
