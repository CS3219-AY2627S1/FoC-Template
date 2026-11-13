import {z} from 'zod';

const environmentSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    JWKS_URL: z.url(),
    SQS_QUEUE_URL: z.url(),
    AWS_REGION: z.string().min(1),
    AWS_ENDPOINT_URL: z.url().optional(),
});

export const readConfig = (env: NodeJS.ProcessEnv = process.env) => {
    const parsed = environmentSchema.parse(env);
    return {
        isDevelopment: parsed.NODE_ENV === 'development',
        jwksUrl: parsed.JWKS_URL,
        queueUrl: parsed.SQS_QUEUE_URL,
        region: parsed.AWS_REGION,
        endpoint: parsed.AWS_ENDPOINT_URL,
    };
};

export type Config = ReturnType<typeof readConfig>;
