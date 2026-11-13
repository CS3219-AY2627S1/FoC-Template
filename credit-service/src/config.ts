import { config as loadEnv } from 'dotenv';

// Resolve from this file so commands can run from either project directory.
loadEnv({ path: new URL('../../.env', import.meta.url), quiet: true });

const config = {
  rabbitMqConnectionString: process.env.RABBITMQ_CONNECTION?.trim(),
  jwt: {
    accessKey: process.env.JWT_ACCESS_SECRET?.trim(),
    issuer: 'user-service',
  },
  dbConnectionString:
    process.env.DATABASE_URL?.trim() || process.env.CREDIT_DB_URL?.trim(),
};

export default config;
