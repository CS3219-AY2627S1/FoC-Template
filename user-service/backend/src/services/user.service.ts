// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-21
// Scope: Generated initial implementation of the User Service domain service.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import type { User, UserId, UserProfileSummary } from '@relay/contracts'
import {
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider'
import { getEnv } from '../config/env.js'
import type { ImageStorage, ImageUpload } from '../storage/image-storage.js'
import type { AuthenticatedUser, UserProfileRecord } from '../types/user.types.js'
import { UserServiceError } from '../types/user.types.js'
import { UserRepository } from '../repositories/user.repository.js'
import {
  validateDeletionConfirmation,
  validateProfileImage,
  validateUpdateProfile,
} from '../validators/user.validator.js'

export interface IdentityGateway {
  deleteAccount(user: AuthenticatedUser): Promise<void>
  getAccountStatus?(cognitoSub: string): Promise<boolean | null>
}

/** Temporary gateway. Can replace this with Cognito deletion later. */
export class MockIdentityGateway implements IdentityGateway {
  async deleteAccount(_user: AuthenticatedUser): Promise<void> {
    return
  }

  async getAccountStatus(_cognitoSub: string): Promise<null> {
    return null
  }
}

export class CognitoIdentityGateway implements IdentityGateway {
  private readonly client: CognitoIdentityProviderClient

  constructor() {
    const env = getEnv()
    this.client = new CognitoIdentityProviderClient({
      region: env.awsRegion,
      endpoint: env.awsEndpointUrl,
    })
  }

  async deleteAccount(user: AuthenticatedUser): Promise<void> {
    try {
      await this.client.send(
        new AdminDeleteUserCommand({ UserPoolId: getEnv().cognitoUserPoolId, Username: user.sub }),
      )
    } catch (error) {
      if (error instanceof Error && error.name === 'UserNotFoundException') return
      throw error
    }
  }

  async getAccountStatus(cognitoSub: string): Promise<boolean> {
    try {
      await this.client.send(
        new AdminGetUserCommand({ UserPoolId: getEnv().cognitoUserPoolId, Username: cognitoSub }),
      )
      return true
    } catch (error) {
      if (error instanceof Error && error.name === 'UserNotFoundException') return false
      throw error
    }
  }
}

export type ProfileUpdateRequest = {
  username?: string
  profilePicture?: string
}

export type DeleteUserResult = {
  status: 'pending'
}

export type UserDeletionStatus = {
  profileExists: boolean
  deletionEventExists: boolean
  identityExists: boolean | null
}

export class UserService {
  constructor(
    private readonly repository: UserRepository,
    private readonly imageStorage: ImageStorage,
    private readonly identityGateway: IdentityGateway,
  ) {}

  async getUser(user: AuthenticatedUser): Promise<User> {
    const profile = await this.repository.findByCognitoSub(user.sub)
    if (!profile) {
      throw new UserServiceError('PROFILE_NOT_FOUND', 'User profile was not found.', 404)
    }
    return this.toPublicProfile(user, profile)
  }

  async getProfileByCognitoSub(cognitoSub: string): Promise<UserProfileSummary> {
    const profile = await this.repository.findByCognitoSub(cognitoSub)
    if (!profile) {
      throw new UserServiceError('PROFILE_NOT_FOUND', 'User profile was not found.', 404)
    }

    return {
      username: profile.username,
      profilePictureUrl: profile.profilePictureKey
        ? await this.imageStorage.url(profile.profilePictureKey)
        : null,
    }
  }

  async getDeletionStatus(cognitoSub: string): Promise<UserDeletionStatus> {
    const profile = await this.repository.findByCognitoSub(cognitoSub)
    return {
      profileExists: profile !== null,
      deletionEventExists: await this.repository.hasPendingDeletion(cognitoSub),
      identityExists: this.identityGateway.getAccountStatus
        ? await this.identityGateway.getAccountStatus(cognitoSub)
        : null,
    }
  }

  async updateUser(user: AuthenticatedUser, input: ProfileUpdateRequest): Promise<User> {
    if (!user.emailVerified) {
      throw new UserServiceError(
        'EMAIL_NOT_VERIFIED',
        'Verify your email before creating or updating a profile.',
        403,
      )
    }

    const request = validateUpdateProfile(input)
    const existing = await this.repository.findByCognitoSub(user.sub)
    if (!existing && request.username === undefined) {
      throw new UserServiceError(
        'VALIDATION_FAILED',
        'A username is required to create a profile.',
        400,
        {
          username: 'Username is required.',
        },
      )
    }

    if (request.username !== undefined) {
      const duplicate = await this.repository.findByUsername(request.username)
      if (duplicate && duplicate.cognitoSub !== user.sub) {
        throw new UserServiceError('USERNAME_TAKEN', 'That username is already taken.', 409, {
          username: 'Username is already taken.',
        })
      }
    }

    let uploadedImage: ImageUpload | undefined
    let newImageKey: string | null | undefined
    if (request.profilePicture !== undefined && request.profilePicture !== null) {
      uploadedImage = validateProfileImage(request.profilePicture)
      const stored = await this.imageStorage.upload(uploadedImage, user.sub)
      newImageKey = stored.key
    } else if (request.profilePicture === null) {
      newImageKey = null
    }

    let profile: UserProfileRecord
    try {
      const update = {
        ...(request.username !== undefined ? { username: request.username } : {}),
        ...(newImageKey !== undefined ? { profilePictureKey: newImageKey } : {}),
      }
      profile = existing
        ? await this.repository.updateProfile(user.sub, update)
        : await this.repository.createProfile(user.sub, update)
    } catch (error) {
      if (newImageKey) await this.deleteUploadedImageSafely(newImageKey)
      if (error instanceof UserServiceError) throw error
      if (isUniqueConstraintError(error)) {
        throw new UserServiceError('USERNAME_TAKEN', 'That username is already taken.', 409)
      }
      throw error
    }

    if (newImageKey !== undefined && existing?.profilePictureKey) {
      await this.deleteUploadedImageSafely(existing.profilePictureKey)
    }
    return this.toPublicProfile(user, profile)
  }

  async deleteUser(user: AuthenticatedUser, confirmation: unknown): Promise<DeleteUserResult | undefined> {
    if (user.role === 'super-admin') {
      throw new UserServiceError('FORBIDDEN', 'The super admin account cannot be deleted.', 403)
    }
    const existing = await this.repository.findByCognitoSub(user.sub)
    if (!existing) {
      if (await this.repository.hasPendingDeletion(user.sub)) return { status: 'pending' }
      throw new UserServiceError('PROFILE_NOT_FOUND', 'User profile was not found.', 404)
    }
    validateDeletionConfirmation(confirmation, existing.username)

    try {
      await this.repository.deleteProfile(user.sub, existing.profilePictureKey)
    } catch (error) {
      // A concurrent delete may have removed the profile after the initial
      // lookup. Treat it as the same pending deletion when its outbox event is
      // present instead of exposing a Prisma not-found error.
      if (isRecordNotFoundError(error) && (await this.repository.hasPendingDeletion(user.sub))) {
        return { status: 'pending' }
      }
      throw error
    }
    try {
      await this.identityGateway.deleteAccount(user)
    } catch (error) {
      console.error(`Cognito deletion pending for ${user.sub}:`, error)
      return { status: 'pending' }
    }
  }

  private async toPublicProfile(user: AuthenticatedUser, profile: UserProfileRecord): Promise<User> {
    return {
      id: profile.id as UserId,
      profileCreated: true,
      email: user.email,
      username: profile.username,
      profilePictureUrl: profile.profilePictureKey
        ? await this.imageStorage.url(profile.profilePictureKey)
        : null,
      emailVerified: user.emailVerified,
      role: user.role,
    }
  }

  private async deleteUploadedImageSafely(key: string): Promise<void> {
    try {
      await this.imageStorage.delete(key)
    } catch {
      // Preserve the original database/storage error. Cleanup can be retried separately.
    }
  }
}

function isUniqueConstraintError(error: unknown): error is { code: 'P2002' } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  )
}

function isRecordNotFoundError(error: unknown): error is { code: 'P2025' } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2025'
  )
}
