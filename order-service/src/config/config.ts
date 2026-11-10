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
    databaseUrl: getEnv("DATABASE_URL"),
    frontendUrl: getEnv("FRONTEND_URL"),
    supplierServiceUrl: getEnv("SUPPLIER_SERVICE_URL"),
    creditServiceUrl: getEnv("CREDIT_SERVICE_URL"),
    jwtPublicKeyPath: getEnv("JWT_PUBLIC_KEY_PATH"),
    orderCreditServiceToken: getEnv("ORDER_CREDIT_SERVICE_TOKEN"),
    orderSupplierServiceToken: getEnv("ORDER_SUPPLIER_SERVICE_TOKEN"),
    rabbitmqUrl: getEnv("RABBITMQ_URL"),
};

export default config;