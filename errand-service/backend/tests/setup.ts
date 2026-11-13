// AI Assistance Disclosure:
// Tool: Codex (ChatGPT-5.6 Sol)
// Date: 2026-10-26
// Scope: Implemented shared test environment/setup integration.
// Author review: Reviewed the output and adjusted configuration and integration details to fit project
// requirements.

import { config } from 'dotenv'

config({ path: '.env.test' })

// Set default DATABASE_URL if not provided
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://relay:relay@localhost:5434/relay_errand?schema=public'
}
