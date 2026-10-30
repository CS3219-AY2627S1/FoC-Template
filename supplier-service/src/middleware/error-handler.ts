//Error handling middleware for supplier service. Only one error handling function should be present.
//AI DECLARATION: Aided by autocomplete from Cursor

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, ErrorCode} from '@middleware/errors';

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof ZodError) {
        return res.status(400).json({
            message: 'Bad Request: Validation failed',
            errors: err.issues,
        });
    }

    const errorCode = err instanceof AppError ? err.code : ErrorCode.INTERNAL;

    switch(errorCode) {
        case ErrorCode.UNAUTHORIZED:
            // e.g. non-admin supplier trying PUT/DELETE/POST
            return res.status(401).json({ message: err.message || 'Unauthorized' });

        case ErrorCode.BAD_REQUEST:
            return res.status(400).json({ message: err.message || 'Bad request' });

        case ErrorCode.CONFLICT:
            // e.g. concurrent write/edit conflict
            return res.status(409).json({ message: err.message || 'Conflict: resource was modified concurrently' });

        case ErrorCode.NOT_FOUND:
            return res.status(404).json({ message: err.message || 'Object not found' });

        case ErrorCode.RATE_LIMITED:
            return res.status(429).json({ message: err.message || 'Too many requests' });

        case ErrorCode.INTERNAL:
        default:
            console.error(err); // log full detail server-side, don't leak it
            return res.status(500).json({ message: 'Internal server error' });   
    }
};

export default errorHandler;
