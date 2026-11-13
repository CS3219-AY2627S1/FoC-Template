/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-17
 * Scope: Generated implementation of viewCredit, viewCreditHistory and reserveCredit handlers.
 * Author review: Verified correctness
 */
import type { NextFunction, Request, Response } from 'express'
import { CreditService } from '../services/credit.service.js'
import { CreditServiceError } from '../types/credit.types.js'
import {
  authenticatedUserId,
  historyOffset,
  reserveCreditRequest,
} from '../validators/credit.validator.js'

export class CreditController {
  constructor(private readonly service: CreditService) {}

  viewCredit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = authenticatedUserId(req, res)
      res.json(await this.service.viewCredit({ userId }))
    } catch (error) {
      next(error)
    }
  }

  viewCreditHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = authenticatedUserId(req, res)
      res.json(await this.service.viewCreditHistory({ userId, offset: historyOffset(req) }))
    } catch (error) {
      next(error)
    }
  }

  reserveCredit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.body?.userId
      if (typeof userId !== 'string' || !userId.trim()) {
        throw new CreditServiceError(
          'INVALID_REQUEST',
          'Internal reservation requires a userId.',
          400,
        )
      }
      res.locals.creditUserId = userId
      res.json(await this.service.reserveCredit(reserveCreditRequest(req, res)))
    } catch (error) {
      next(error)
    }
  }
}
