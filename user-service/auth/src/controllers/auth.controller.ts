/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-28
 * Scope: Generated implementation for authentication endpoints and token cookies
 * Author review: Verified logic correctness and correct error codes and messages.
 */

import type { NextFunction, Request, Response } from 'express'
import { AuthService } from '../services/auth.service.js'
import { getEnv } from '../config/env.js'
import { AuthError } from '../types/auth.types.js'
const env = getEnv()
function publicUser(user: { sub: string; email: string; emailVerified: boolean; role: string }) {
  return {
    subject: user.sub,
    email: user.email,
    emailVerified: user.emailVerified,
    role: user.role,
  }
}
function cookie(req: Request, name: string) {
  return req
    .header('cookie')
    ?.split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}
function setCookies(res: Response, access: string, id: string, refresh: string) {
  const secure = env.cookieSecure ? '; Secure' : ''
  res.append(
    'Set-Cookie',
    `relay_access=${access}; Path=/; HttpOnly; SameSite=Strict${secure}; Max-Age=900`,
  )
  res.append(
    'Set-Cookie',
    `relay_id=${id}; Path=/; HttpOnly; SameSite=Strict${secure}; Max-Age=900`,
  )
  res.append(
    'Set-Cookie',
    `relay_refresh=${refresh}; Path=/api/auth; HttpOnly; SameSite=Strict${secure}`,
  )
}
function clearCookies(res: Response) {
  const secure = env.cookieSecure ? '; Secure' : ''
  res.append('Set-Cookie', `relay_access=; Path=/; HttpOnly; SameSite=Strict${secure}; Max-Age=0`)
  res.append('Set-Cookie', `relay_id=; Path=/; HttpOnly; SameSite=Strict${secure}; Max-Age=0`)
  res.append(
    'Set-Cookie',
    `relay_refresh=; Path=/api/auth; HttpOnly; SameSite=Strict${secure}; Max-Age=0`,
  )
}
export class AuthController {
  constructor(private service = new AuthService()) {}
  private run(next: NextFunction, action: () => Promise<void>) {
    void action().catch(next)
  }
  register = (req: Request, res: Response, next: NextFunction) =>
    this.run(next, async () => {
      res.status(201).json({ ok: true, data: await this.service.register(req.body) })
    })
  resend = (req: Request, res: Response, next: NextFunction) =>
    this.run(next, async () => {
      await this.service.resend(req.body)
      res.status(204).send()
    })
  verify = (req: Request, res: Response, next: NextFunction) =>
    this.run(next, async () => {
      const result = await this.service.verify(req.body)
      setCookies(res, result.accessToken, result.idToken, result.refreshToken)
      res.json({ ok: true, data: { user: publicUser(result.user) } })
    })
  login = (req: Request, res: Response, next: NextFunction) =>
    this.run(next, async () => {
      const result = await this.service.login(req.body)
      setCookies(res, result.accessToken, result.idToken, result.refreshToken)
      res.json({ ok: true, data: { user: publicUser(result.user) } })
    })
  refresh = (req: Request, res: Response, next: NextFunction) =>
    this.run(next, async () => {
      const token = cookie(req, 'relay_refresh')
      if (!token) throw new AuthError('UNAUTHENTICATED', 'A refresh token is required.', 401)
      const result = await this.service.refresh(token)
      setCookies(res, result.accessToken, result.idToken, result.refreshToken)
      res.json({ ok: true, data: { user: publicUser(result.user) } })
    })
  me = (req: Request, res: Response) => {
    res.json({
      ok: true,
      data: {
        user: {
          subject: req.user!.sub,
          email: req.user!.email,
          emailVerified: req.user!.emailVerified,
          role: req.user!.role,
        },
      },
    })
  }
  logout = (req: Request, res: Response, next: NextFunction) =>
    this.run(next, async () => {
      try {
        await this.service.logout(cookie(req, 'relay_refresh'))
      } finally {
        clearCookies(res)
      }
      res.status(204).send()
    })
  changePassword = (req: Request, res: Response, next: NextFunction) =>
    this.run(next, async () => {
      await this.service.changePassword(req.user!, req.body)
      clearCookies(res)
      res.status(204).send()
    })
  promote = (req: Request, res: Response, next: NextFunction) =>
    this.run(next, async () => {
      await this.service.changeAdmin(req.body, 'promote')
      res.status(204).send()
    })
  demote = (req: Request, res: Response, next: NextFunction) =>
    this.run(next, async () => {
      await this.service.changeAdmin(req.body, 'demote')
      res.status(204).send()
    })
}
