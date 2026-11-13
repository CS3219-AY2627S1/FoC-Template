// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-21
// Scope: Generated initial implementation of the User Service repository.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import { PrismaClient } from '@relay/user-prisma'
import { UserEventTypes, type UserDeletedEvent, type UserRegisteredEvent } from '@relay/contracts'
import type { ProfileUpdate, UserProfileRecord } from '../types/user.types.js'

export const prisma = new PrismaClient()

type PersistedUserProfile = {
  id: string
  cognitoSub: string
  username: string | null
  profilePictureKey: string | null
  createdAt: Date
  updatedAt: Date
}

function toProfileRecord(profile: PersistedUserProfile): UserProfileRecord {
  return {
    id: profile.id,
    cognitoSub: profile.cognitoSub,
    username: profile.username,
    profilePictureKey: profile.profilePictureKey,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  }
}

export class UserRepository {
  async findByCognitoSub(cognitoSub: string): Promise<UserProfileRecord | null> {
    const profile = await prisma.userProfile.findUnique({
      where: { cognitoSub },
    })
    return profile ? toProfileRecord(profile) : null
  }

  async findByUsername(username: string): Promise<UserProfileRecord | null> {
    const profile = await prisma.userProfile.findUnique({
      where: { username },
    })
    return profile ? toProfileRecord(profile) : null
  }

  async createProfile(cognitoSub: string, update: ProfileUpdate): Promise<UserProfileRecord> {
    const profile = await prisma.$transaction(async (tx) => {
      const created = await tx.userProfile.create({
        data: {
          cognitoSub,
          username: update.username,
          profilePictureKey: update.profilePictureKey,
        },
      })
      await tx.userOutboxEvent.create({
        data: {
          topic: 'user-events',
          key: cognitoSub,
          payload: {
            eventId: crypto.randomUUID(),
            eventType: UserEventTypes.USER_REGISTERED,
            timestamp: new Date().toISOString(),
            version: 1,
            payload: { cognitoSub },
          } satisfies UserRegisteredEvent,
        },
      })
      return created
    })
    return toProfileRecord(profile)
  }

  async updateProfile(cognitoSub: string, update: ProfileUpdate): Promise<UserProfileRecord> {
    const profile = await prisma.userProfile.update({
      where: { cognitoSub },
      data: {
        ...(update.username !== undefined ? { username: update.username } : {}),
        ...(update.profilePictureKey !== undefined
          ? { profilePictureKey: update.profilePictureKey }
          : {}),
      },
    })
    return toProfileRecord(profile)
  }

  async hasPendingDeletion(cognitoSub: string): Promise<boolean> {
    const event = await prisma.userOutboxEvent.findFirst({
      where: {
        topic: 'user-events',
        key: cognitoSub,
        payload: { path: ['eventType'], equals: UserEventTypes.USER_DELETED },
      },
      select: { id: true },
    })
    return event !== null
  }

  async deleteProfile(cognitoSub: string, profilePictureKey?: string | null): Promise<UserProfileRecord> {
    const profile = await prisma.$transaction(async (tx) => {
      const deleted = await tx.userProfile.delete({ where: { cognitoSub } })
      await tx.userOutboxEvent.create({
        data: {
          topic: 'user-events',
          key: cognitoSub,
          payload: {
            eventId: crypto.randomUUID(),
            eventType: UserEventTypes.USER_DELETED,
            timestamp: new Date().toISOString(),
            version: 1,
            payload: {
              cognitoSub,
              ...(profilePictureKey ? { profilePictureKey } : {}),
            },
          } satisfies UserDeletedEvent,
        },
      })
      return deleted
    })
    return toProfileRecord(profile)
  }
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect()
}
