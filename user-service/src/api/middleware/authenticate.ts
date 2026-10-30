import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import type { Roles } from '@prisma/client';
import { jwtPublicKey } from '../../env';

// Verifies the Bearer JWT and attaches the caller's identity to req.user. 
export const authenticate: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized', message: 'Missing or malformed bearer token.' });
    return;
  }

  try {
    const payload = jwt.verify(header.slice('Bearer '.length), jwtPublicKey, {
      algorithms: ['RS256'],
    }) as jwt.JwtPayload & { roles: Roles[] };

    req.user = { id: payload.sub as string, roles: payload.roles };
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token.' });
  }
};
