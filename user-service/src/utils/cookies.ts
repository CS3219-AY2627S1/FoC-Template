// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-25
// 25/09/2026: Stage 4a - shared refresh cookie options
// Author review:

import type { CookieOptions } from 'express';
import { config } from '../config.js';

export const REFRESH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: config.env === 'production',
  sameSite: 'lax',
};
