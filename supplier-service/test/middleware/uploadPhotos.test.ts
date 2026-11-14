/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Tests for the multipart upload middleware per Phase 2 plan Task 8. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5): moved from src/middleware/uploadPhotos.test.ts to test/middleware/uploadPhotos.test.ts and updated
 *        the relative imports; no test logic changed. No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review:
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { uploadPhotos } from '../../src/middleware/uploadPhotos.js';

const app = express();
app.post('/x', uploadPhotos, (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  res.json({ fields: req.body, names: files.map((f) => f.originalname), types: files.map((f) => f.mimetype) });
});
app.use(errorHandler);

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe('uploadPhotos', () => {
  it('parses text fields and keeps photos in request order', async () => {
    const res = await request(app)
      .post('/x')
      .field('name', 'Campus Store')
      .attach('photos', png, { filename: 'a.png', contentType: 'image/png' })
      .attach('photos[]', png, { filename: 'b.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.fields.name).toBe('Campus Store');
    expect(res.body.names).toEqual(['a.png', 'b.jpg']);
  });

  it('rejects a non JPEG/PNG file with 422', async () => {
    const res = await request(app).post('/x').attach('photos', png, { filename: 'a.gif', contentType: 'image/gif' });
    expect(res.status).toBe(422);
    expect(res.body.details[0].field).toBe('photos');
  });

  it('rejects a photo over 5 MB with 422', async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1);
    const res = await request(app).post('/x').attach('photos', big, { filename: 'big.png', contentType: 'image/png' });
    expect(res.status).toBe(422);
  });

  it('rejects more than 10 photos with 422', async () => {
    let req = request(app).post('/x');
    for (let i = 0; i < 11; i += 1) {
      req = req.attach('photos', png, { filename: `p${i}.png`, contentType: 'image/png' });
    }
    expect((await req).status).toBe(422);
  });

  it('accepts exactly 10 photos', async () => {
    let req = request(app).post('/x');
    for (let i = 0; i < 10; i += 1) {
      req = req.attach('photos', png, { filename: `p${i}.png`, contentType: 'image/png' });
    }
    expect((await req).status).toBe(200);
  });

  it('answers 400 for a malformed multipart body', async () => {
    const res = await request(app)
      .post('/x')
      .set('Content-Type', 'multipart/form-data; boundary=abc')
      .send('--abc\r\nContent-Disposition: form-data; name="a"\r\n\r\nbroken');
    expect(res.status).toBe(400);
  });
});
