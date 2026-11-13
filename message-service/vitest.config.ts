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
            // Never called: test/helpers/auth.ts answers in place of the user-service.
            USER_SERVICE_URL: "http://user-service.test",
            // Never called either: test/helpers/auth.ts also answers in place of the order-service.
            ORDER_SERVICE_URL: "http://order-service.test",
            BROKER_URL: "amqp://unused",
        },
    },
});
