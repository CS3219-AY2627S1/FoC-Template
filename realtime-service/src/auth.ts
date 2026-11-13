import {verifyWithJwks} from 'hono/jwt';

export const verifyAccessToken = (token: string, jwksUrl: string) =>
    verifyWithJwks(token, {
        jwks_uri: jwksUrl,
        allowedAlgorithms: ['ES256'],
    });
