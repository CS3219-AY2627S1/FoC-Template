/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-28
 * Scope: Generated implementation for Cognito authentication flows
 * Author review: Verified all mappings to Cognito functions are correct, and error codes and messages are suitable.
 */

import {
  AdminAddUserToGroupCommand,
  AdminGetUserCommand,
  AdminRemoveUserFromGroupCommand,
  AdminUserGlobalSignOutCommand,
  ChangePasswordCommand,
  CognitoIdentityProviderClient,
  ConfirmSignUpCommand,
  GetTokensFromRefreshTokenCommand,
  InitiateAuthCommand,
  ListUsersInGroupCommand,
  ResendConfirmationCodeCommand,
  RevokeTokenCommand,
  SignUpCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import { getEnv } from '../config/env.js'
import { AuthError } from '../types/auth.types.js'
import {
  adminSchema,
  loginSchema,
  passwordSchema,
  registerSchema,
  resendSchema,
  validate,
  verificationSchema,
} from '../validators/auth.validator.js'
import { verifyCognitoTokens, type AuthenticatedUser } from '@relay/user-auth-backend-middleware'

const env = getEnv()
const cognito = new CognitoIdentityProviderClient({ region: env.region, endpoint: env.endpoint })
async function identity(accessToken: string, idToken: string): Promise<AuthenticatedUser> {
  return verifyCognitoTokens(accessToken, idToken)
}
function mapError(error: unknown): never {
  if (error instanceof AuthError) throw error
  const name = error instanceof Error ? error.name : ''
  if (name === 'UsernameExistsException')
    throw new AuthError('EMAIL_ALREADY_REGISTERED', 'This email is already registered.', 409)
  if (name === 'UserNotConfirmedException')
    throw new AuthError('EMAIL_NOT_VERIFIED', 'Verify your email before signing in.', 403)
  if (name === 'NotAuthorizedException' || name === 'UserNotFoundException')
    throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password.', 401)
  if (name === 'CodeMismatchException')
    throw new AuthError('OTP_INVALID', 'The verification code is invalid.', 400)
  if (name === 'ExpiredCodeException')
    throw new AuthError('OTP_EXPIRED', 'The verification code has expired.', 400)
  if (name === 'LimitExceededException' || name === 'TooManyRequestsException')
    throw new AuthError('RATE_LIMITED', 'Too many attempts. Try again later.', 429)
  throw error
}
export class AuthService {
  async register(input: unknown) {
    const request = validate(registerSchema, input)
    if (request.password !== request.passwordConfirmation)
      throw new AuthError('VALIDATION_FAILED', 'Passwords must match.', 400, {
        passwordConfirmation: 'Passwords must match.',
      })
    try {
      await cognito.send(
        new SignUpCommand({
          ClientId: env.clientId,
          Username: request.email,
          Password: request.password,
          UserAttributes: [{ Name: 'email', Value: request.email }],
        }),
      )
    } catch (error) {
      mapError(error)
    }
    return { verificationRequired: true as const }
  }
  async resend(input: unknown) {
    const { email } = validate(resendSchema, input)
    try {
      await cognito.send(
        new ResendConfirmationCodeCommand({ ClientId: env.clientId, Username: email }),
      )
    } catch (error) {
      mapError(error)
    }
  }
  async verify(input: unknown) {
    const request = validate(verificationSchema, input)
    try {
      await cognito.send(
        new ConfirmSignUpCommand({
          ClientId: env.clientId,
          Username: request.email,
          ConfirmationCode: request.code,
        }),
      )
    } catch (error) {
      mapError(error)
    }
    return this.login(request)
  }
  async login(input: unknown) {
    const { email, password } = validate(loginSchema, input)
    try {
      const result = await cognito.send(
        new InitiateAuthCommand({
          AuthFlow: 'USER_PASSWORD_AUTH',
          ClientId: env.clientId,
          AuthParameters: { USERNAME: email, PASSWORD: password },
        }),
      )
      const access = result.AuthenticationResult?.AccessToken,
        id = result.AuthenticationResult?.IdToken,
        refresh = result.AuthenticationResult?.RefreshToken
      if (!access || !id || !refresh)
        throw new AuthError('INTERNAL_ERROR', 'Cognito did not return the required tokens.', 500)
      return {
        user: await identity(access, id),
        accessToken: access,
        idToken: id,
        refreshToken: refresh,
      }
    } catch (error) {
      mapError(error)
    }
  }
  async refresh(refreshToken: string) {
    try {
      const result = await cognito.send(
        new GetTokensFromRefreshTokenCommand({
          ClientId: env.clientId,
          RefreshToken: refreshToken,
        }),
      )
      const access = result.AuthenticationResult?.AccessToken,
        id = result.AuthenticationResult?.IdToken
      if (!access || !id)
        throw new AuthError('UNAUTHENTICATED', 'The refresh token is invalid.', 401)
      return {
        user: await identity(access, id),
        accessToken: access,
        idToken: id,
        refreshToken: result.AuthenticationResult?.RefreshToken ?? refreshToken,
      }
    } catch (error) {
      mapError(error)
    }
  }
  async logout(refreshToken?: string) {
    if (!refreshToken) return
    try {
      await cognito.send(new RevokeTokenCommand({ ClientId: env.clientId, Token: refreshToken }))
    } catch (error) {
      if (!(
        error instanceof Error &&
        ['NotAuthorizedException', 'InvalidParameterException'].includes(error.name)
      ))
        throw error
    }
  }
  async changePassword(user: AuthenticatedUser, input: unknown) {
    const request = validate(passwordSchema, input)
    if (request.newPassword !== request.newPasswordConfirmation)
      throw new AuthError('VALIDATION_FAILED', 'Passwords must match.', 400, {
        newPasswordConfirmation: 'Passwords must match.',
      })
    let access: string | undefined
    try {
      const result = await cognito.send(
        new InitiateAuthCommand({
          AuthFlow: 'USER_PASSWORD_AUTH',
          ClientId: env.clientId,
          AuthParameters: { USERNAME: user.email, PASSWORD: request.currentPassword },
        }),
      )
      access = result.AuthenticationResult?.AccessToken
      if (!access) throw new AuthError('UNAUTHENTICATED', 'Cognito authentication failed.', 401)
      await cognito.send(
        new ChangePasswordCommand({
          AccessToken: access,
          PreviousPassword: request.currentPassword,
          ProposedPassword: request.newPassword,
        }),
      )
    } catch (error) {
      mapError(error)
    }
    await cognito.send(
      new AdminUserGlobalSignOutCommand({ UserPoolId: env.poolId, Username: user.email }),
    )
  }
  private async inGroup(email: string, group: string): Promise<boolean> {
    let next: string | undefined
    do {
      const page = await cognito.send(
        new ListUsersInGroupCommand({ UserPoolId: env.poolId, GroupName: group, NextToken: next }),
      )
      if (
        page.Users?.some((u) =>
          u.Attributes?.some((a) => a.Name === 'email' && a.Value?.toLowerCase() === email),
        )
      )
        return true
      next = page.NextToken
    } while (next)
    return false
  }
  async changeAdmin(input: unknown, action: 'promote' | 'demote') {
    const { email } = validate(adminSchema, input)
    try {
      await cognito.send(new AdminGetUserCommand({ UserPoolId: env.poolId, Username: email }))
    } catch (error) {
      if (error instanceof Error && error.name === 'UserNotFoundException')
        throw new AuthError('USER_NOT_FOUND', 'No user exists with that email.', 404)
      throw error
    }
    if (await this.inGroup(email, env.superGroup))
      throw new AuthError('FORBIDDEN', 'The super admin role cannot be changed.', 403)
    const isAdmin = await this.inGroup(email, env.adminGroup)
    if (action === 'promote' && isAdmin)
      throw new AuthError('ALREADY_ADMIN', 'This user is already an admin.', 409)
    if (action === 'demote' && !isAdmin)
      throw new AuthError('NOT_ADMIN', 'This user is not an admin.', 409)
    await cognito.send(
      action === 'promote'
        ? new AdminAddUserToGroupCommand({
            UserPoolId: env.poolId,
            Username: email,
            GroupName: env.adminGroup,
          })
        : new AdminRemoveUserFromGroupCommand({
            UserPoolId: env.poolId,
            Username: email,
            GroupName: env.adminGroup,
          }),
    )
  }
}
