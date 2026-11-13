import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["test/**/*.test.ts"],
        setupFiles: ["test/setup.ts"],
        // Each test file starts its own in-memory MongoDB, the first run may download it.
        hookTimeout: 120_000,
        coverage: {
            include: ["src/**/*.ts"],
        },
        env: {
            NODE_ENV: "test",
            LOG_LEVEL: "silent",
            // The app never connects by itself in tests; test/helpers/db.ts does.
            MONGO_URL: "mongodb://unused",
            // Tests pass a fake publisher instead; nothing connects to a broker.
            BROKER_URL: "amqp://unused",
            OTP_SECRET: "test-otp-secret-with-at-least-32-characters",
            SMTP_HOST: "localhost",
            SMTP_PORT: "1025",
            MAIL_FROM: "Relay <no-reply@relay.test>",
            COOKIE_SECURE: "false",
            ADMIN_EMAIL: "admin@nus.edu.sg",
            ADMIN_PASSWORD: "admin-password",
        },
    },
});