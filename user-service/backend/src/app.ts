// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-21
// Scope: Generated initial implementation of the User Service application.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import express, { type ErrorRequestHandler } from 'express'
import { UserController } from './controllers/user.controller.js'
import { prisma, UserRepository } from './repositories/user.repository.js'
import { createUserRouter } from './routes/user.routes.js'
import {
  CognitoIdentityGateway,
  MockIdentityGateway,
  UserService,
} from './services/user.service.js'
import { getEnv } from './config/env.js'
import { LocalImageStorage } from './storage/local-image-storage.js'
import { UserServiceError } from './types/user.types.js'
import { internalServiceAuth } from './middleware/internal-auth.middleware.js'

const repository = new UserRepository()
const imageStorage = new LocalImageStorage()
const identityGateway =
  getEnv().authMode === 'cognito' ? new CognitoIdentityGateway() : new MockIdentityGateway()
const userService = new UserService(repository, imageStorage, identityGateway)
const userController = new UserController(userService)

export const app = express()

// A 5 MB binary image becomes larger when represented as a base64 data URL.
app.use(express.json({ limit: '7mb' }))

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' })
})

app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok' })
})

app.use('/api/user', createUserRouter(userController))
app.get('/internal/user/profile/:sub', internalServiceAuth, userController.getProfileBySubject)
app.get('/internal/user/deletion-status/:sub', internalServiceAuth, userController.getDeletionStatus)

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof UserServiceError) {
    res.status(error.statusCode).json({
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
      },
    })
    return
  }

  if (error instanceof SyntaxError) {
    res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'The request body contains invalid JSON.',
      },
    })
    return
  }

  console.error(error)
  res.status(500).json({
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    },
  })
}

app.use(errorHandler)

export async function closeAppResources(): Promise<void> {
  await prisma.$disconnect()
}
