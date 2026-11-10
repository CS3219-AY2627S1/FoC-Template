import "dotenv/config";

function getEnv(name: string): string {
    const value = process.env[name];

    if (!value) {
        throw new Error(`${name} is not configured`);
    }

    return value;
}

function getEnvNumber(name: string): number {
    const value = getEnv(name);
    const number = Number(value);

    if (Number.isNaN(number)) {
        throw new Error(`${name} must be a number`);
    }

    return number;
}

const config = {
    port: getEnvNumber("PORT"),
    nodeEnv: getEnv("NODE_ENV"),
    frontendUrl: getEnv("FRONTEND_URL"),
    databaseUrl: getEnv("DATABASE_URL"),
    jwtPrivateKeyPath: getEnv("JWT_PRIVATE_KEY_PATH"),
    jwtPublicKeyPath: getEnv("JWT_PUBLIC_KEY_PATH"),
    jwtRefreshTokenKey: getEnv("JWT_REFRESH_TOKEN_KEY"),
    cookieSecret: getEnv("COOKIE_SECRET"),
};

export default config;