// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-09-27
// Scope: Scaffolded the Supplier application wiring from the author-defined service structure.
// Author review: Reviewed outputs, corrected phrasing and syntax, and adjusted implementation
// details to fit project requirements.

import express from 'express'
import { SupplierController } from './controllers/supplier.controller.js'
import { SupplierService } from './services/supplier.service.js'
import { SupplierRepository } from './repositories/supplier.repository.js'
import { createSupplierRouter } from './routes/supplier.routes.js'
import { createInternalSupplierRouter } from './routes/internal-supplier.routes.js'
import { internalServiceAuth } from './middleware/internal-auth.middleware.js'
import { getEnv } from './config/env.js'
import { SupplierErrors } from '@relay/contracts/supplier'
import { SupplierServiceError } from './types/supplier.types.js'
import { query } from './db.js'

const repository = new SupplierRepository()
const service = new SupplierService(repository)
const controller = new SupplierController(service)
const supplierRouter = createSupplierRouter(controller)
const internalSupplierRouter = createInternalSupplierRouter(controller)

const app = express()
const env = getEnv()

app.use(express.json())

app.get('/healthz', async (_req, res) => {
  try {
    await query('SELECT 1')
    res.json({ status: 'ok' })
  } catch {
    res.status(503).json({ status: 'unavailable' })
  }
})

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// API routes
app.use('/api/supplier', supplierRouter)
app.use('/internal/suppliers', internalServiceAuth, internalSupplierRouter)

app.use(
  (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof SupplierServiceError) {
      res.status(error.statusCode).json({ code: error.code, message: error.message })
      return
    }

    console.error(error)
    res.status(500).json({ code: SupplierErrors.INTERNAL_ERROR, message: 'Internal server error' })
  },
)

app.listen(env.port, () => {
  console.log(`Supplier API listening on port ${env.port}`)
})
