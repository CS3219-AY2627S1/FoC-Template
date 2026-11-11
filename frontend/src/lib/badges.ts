/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-03
 * Scope: Generated the Badges Service call the profile's badges card reads.
 * Reviewed by Ngooi Jun Sen.
 *
 * GET /api/v1/badges/{userId} (badges-service/src/routes/badges.routes.ts):
 * every catalogue badge, earned or not. Badges are private, so the service
 * answers 404 for anyone but the signed-in user, and this is only ever called
 * with their own id.
 */

import { api } from './api';

export type BadgeRole = 'courier' | 'requester' | 'any';

export interface Badge {
  badgeId: string;
  title: string;
  description: string;
  targetRole: BadgeRole;
  earned: boolean;
  earnedAt: Date | null;
  /** How far along an unearned badge is; null once earned. */
  progress: { current: number; target: number } | null;
}

export interface UserBadges {
  earnedCount: number;
  totalCount: number;
  badges: Badge[];
}

interface UserBadgesResponse {
  earnedCount: number;
  totalCount: number;
  badges: (Omit<Badge, 'earnedAt'> & { displayOrder: number; earnedAt: string | null })[];
}

export async function fetchMyBadges(userId: string): Promise<UserBadges> {
  const result = await api.get<UserBadgesResponse>(`/badges/${encodeURIComponent(userId)}`);
  return {
    earnedCount: result.earnedCount,
    totalCount: result.totalCount,
    badges: [...result.badges]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((badge) => ({
        badgeId: badge.badgeId,
        title: badge.title,
        description: badge.description,
        targetRole: badge.targetRole,
        earned: badge.earned,
        earnedAt: badge.earnedAt === null ? null : new Date(badge.earnedAt),
        progress: badge.progress,
      })),
  };
}
