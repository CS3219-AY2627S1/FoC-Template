// AI Assistance Disclosure:
// Tool: Codex (ChatGPT-5.6 Sol)
// Date: 2026-11-03
// Scope: Implemented shared estimation test environment/setup integration.
// Author review: Reviewed the output and adjusted configuration to fit project requirements

import { config } from 'dotenv'

config({ path: '.env.example' })

// Set default env vars if not provided
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://relay:relay@localhost:5434/relay_credit?schema=public'
}
