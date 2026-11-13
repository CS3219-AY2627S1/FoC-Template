// AI Assistance Disclosure:
// Tool: Codex (ChatGPT-5.6 Sol)
// Date: 2026-11-10
// Scope: Implemented migration startup/build integration.
// Author review: Reviewed the output and adjusted configuration details to fit project
// requirements.

import fs from 'node:fs'
import { Client } from 'pg'

async function main() {
  const ssl = process.env.DB_SSL_CA_PATH
    ? { ca: fs.readFileSync(process.env.DB_SSL_CA_PATH, 'utf8'), rejectUnauthorized: true }
    : undefined
  const client = new Client({ connectionString: process.env.SUPPLIER_DATABASE_URL, ssl })
  await client.connect()
  try {
    await client.query(fs.readFileSync('/app/schema.sql', 'utf8'))
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
