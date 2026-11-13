// AI-assisted (Claude), reviewed and tested by Maliha
// Additional use: (Claude Code, Claude Opus 5.5), 2026-11-12: added REDIS_URL for multi-pod chat. See ai/usage-log.md, entry 009.
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
}

export const env = {
  PORT: Number(process.env.PORT ?? 3005),
  DATABASE_URL: required('DATABASE_URL'),
  USER_SERVICE_PUBLIC_KEY_PATH: required('USER_SERVICE_PUBLIC_KEY_PATH'),
  ORDER_SERVICE_URL: process.env.ORDER_SERVICE_URL ?? 'http://localhost:3003',
  // Optional. Set when running several chat pods, so they share chat rooms
  // through Redis. Unset (local dev, one process): rooms stay in memory.
  REDIS_URL: process.env.REDIS_URL,
};