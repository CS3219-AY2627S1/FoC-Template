import "dotenv/config";

function required(name: string): string {
    const value = process.env[name];
    if (!value || value.trim().length === 0) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

const dbConnectionString = Deno.env.get("DATABASE_URL");

const config = {
    shouldGenerateLogfile: false,
    jwt: {
        // shared with the user service, which signs the access tokens
        accessKey: required('JWT_ACCESS_SECRET'),
        issuer: 'user-service',
    },
    supplier: {
        // opening hours are stored as local campus time
        timezone: 'Asia/Singapore',
        defaultPageSize: 20,
        maxPageSize: 100,
        maxSearchLength: 100,
    },
    dbConnectionString,
};

export default config;
