/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Multipart upload middleware (multer) per Phase 2 plan Task 8;
 *        SupplierServiceArchitecture.md §7, §8.2. No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review: Congchen
 */
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { AppError } from '../utils/AppError.js';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_PHOTOS = 10;
const ALLOWED_FIELDS = ['photos', 'photos[]'];
const ALLOWED_TYPES = ['image/jpeg', 'image/png'];

function invalidPhotos(message: string): AppError {
  return new AppError(422, 'Unprocessable Entity', message, {
    details: [{ field: 'photos', location: 'body', message }],
  });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES, files: MAX_PHOTOS },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_FIELDS.includes(file.fieldname)) {
      cb(invalidPhotos('Photos must be sent in the photos field.'));
      return;
    }
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      cb(invalidPhotos('Photos must be JPEG or PNG.'));
      return;
    }
    cb(null, true);
  },
}).any();

/** Parses multipart/form-data with multer (Arch §7, §8.2): 0-10 JPEG/PNG photos, at most 5 MB each. */
export function uploadPhotos(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (error: unknown) => {
    if (error === undefined || error === null) {
      next();
      return;
    }
    if (error instanceof AppError) {
      next(error);
      return;
    }
    if (error instanceof multer.MulterError) {
      const message =
        error.code === 'LIMIT_FILE_SIZE'
          ? 'Each photo must be at most 5 MB.'
          : error.code === 'LIMIT_FILE_COUNT'
            ? 'At most 10 photos are allowed.'
            : 'Photos could not be accepted.';
      next(invalidPhotos(message));
      return;
    }
    next(new AppError(400, 'Bad Request', 'The multipart/form-data request is malformed.'));
  });
}
