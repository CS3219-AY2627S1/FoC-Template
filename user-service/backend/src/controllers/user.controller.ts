// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-21
// Scope: Generated initial implementation of the User Service controller.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import type { NextFunction, Request, Response } from 'express'
import type { UserApiErrorCode } from '@relay/contracts'
import { UserService } from '../services/user.service.js'

export class UserController {
  constructor(private readonly userService: UserService) {}

  checkAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!
      res.status(200).json({ success: true, data: { role: user.role } })
    } catch (error) {
      next(error)
    }
  }

  getUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!
      const profile = await this.userService.getUser(user)
      res.status(200).json({ ok: true, data: profile })
    } catch (error) {
      next(error)
    }
  }

  getProfileBySubject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const subject = typeof req.params.sub === 'string' ? req.params.sub : undefined
      if (!subject) {
        const code: UserApiErrorCode = 'VALIDATION_FAILED'
        res.status(400).json({
          ok: false,
          error: { code, message: 'A user subject is required.' },
        })
        return
      }

      const profile = await this.userService.getProfileByCognitoSub(subject)
      res.status(200).json({ ok: true, data: profile })
    } catch (error) {
      next(error)
    }
  }

  getDeletionStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const subject = typeof req.params.sub === 'string' ? req.params.sub : undefined
      if (!subject) {
        res.status(400).json({
          ok: false,
          error: { code: 'VALIDATION_FAILED', message: 'A user subject is required.' },
        })
        return
      }
      res.status(200).json({ ok: true, data: await this.userService.getDeletionStatus(subject) })
    } catch (error) {
      next(error)
    }
  }

  updateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!
      const profile = await this.userService.updateUser(user, req.body)
      res.status(200).json({ ok: true, data: profile })
    } catch (error) {
      next(error)
    }
  }

  deleteUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!
      const result = await this.userService.deleteUser(user, req.body?.confirmation)

      res.clearCookie('relay_access', {
        path: '/',
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.COOKIE_SECURE !== 'false',
      })
      res.clearCookie('relay_id', {
        path: '/',
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.COOKIE_SECURE !== 'false',
      })
      res.clearCookie('relay_refresh', {
        path: '/api/auth',
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.COOKIE_SECURE !== 'false',
      })
      if (result?.status === 'pending') {
        res.status(202).json({ ok: true, data: result })
        return
      }
      res.status(204).send()
    } catch (error) {
      next(error)
    }
  }
}
