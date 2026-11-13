import "dotenv/config";
import { Role } from "./prisma/common";

function required(name: string): string {
    const value = process.env[name];
    if (!value || value.trim().length === 0) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

const accessKey = required('JWT_ACCESS_SECRET');
const refreshKey = required('JWT_REFRESH_SECRET');

const accessTtl = required('JWT_ACCESS_TOKEN_TTL');
const refreshTtl = required('JWT_REFRESH_TOKEN_TTL');

const dbConnectionString = Deno.env.get("DATABASE_URL");
const rabbitMqConnectionString = Deno.env.get("RABBITMQ_CONNECTION");

const config = {
    shouldGenerateLogfile: false,
    password: {
        minLength: 12,
        minUniqueCategories: 3,
    },
    jwt: {
        accessKey,
        refreshKey,
        accessTtl,
        refreshTtl,
        issuer: 'user-service',
    },
    user: {
        defaultRoles: [Role.Courier, Role.Requestor],
        nicknameMaxLength: 25,
    },
    adminInviteCodeExpiryTime: 24 * 60 * 60, // seconds
    favourite: {
        maxPerUser: 20,
        labelMaxLength: 30,
    },
    // supplier service on the private docker network (alias supplier_api), used to check bookmarks
    supplierServiceUrl: Deno.env.get("SUPPLIER_SERVICE_URL") ?? "http://supplier_api:3000",
    dbConnectionString,
    rabbitMqConnectionString,
};

export default config;
