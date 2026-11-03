/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-03
 * Scope: Generated the User Service friendship calls the friends page and the
 *        order pages' add-friend control share.
 * Reviewed by Ngooi Jun Sen.
 *
 * Endpoints are user-service's (user-service/README.md, Friendships):
 *   POST   /api/v1/user/friends/request            { targetUserId }
 *   GET    /api/v1/user/friends/requests           ?direction=incoming|outgoing
 *   POST   /api/v1/user/friends/{requestId}/accept
 *   POST   /api/v1/user/friends/{requestId}/reject
 *   GET    /api/v1/user/friends
 *   DELETE /api/v1/user/friends/{friendUserId}
 *
 * People come back as id and name only. There is no user search and no way to
 * cancel a request you sent: it stays pending until the other person answers.
 */

import { useSyncExternalStore } from 'react';
import { ApiError, api } from './api';

export interface FriendSummary {
  id: string;
  name: string;
}

export interface FriendRequest {
  requestId: string;
  createdAt: Date;
  sender: FriendSummary;
  recipient: FriendSummary;
}

interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

type FriendRequestResponse = Omit<FriendRequest, 'createdAt'> & { createdAt: string };

/**
 * User's largest page. Past this many, the lists stop at the first hundred;
 * nobody on a campus errand app is expected to reach it.
 */
const PAGE_SIZE = 100;

export async function fetchFriends(): Promise<FriendSummary[]> {
  return (await fetchFriendsPage(1, PAGE_SIZE)).items;
}

/**
 * Every friend, for searching by name: the friends endpoint has no name
 * filter, so a search over one page would miss friends on later pages. Reads
 * User's largest pages until the total is reached, stopping at
 * MAX_SEARCH_PAGES so a very long list cannot fire unbounded requests.
 */
const MAX_SEARCH_PAGES = 20;

export async function fetchAllFriends(): Promise<FriendSummary[]> {
  const first = await fetchFriendsPage(1, PAGE_SIZE);
  const pages = Math.min(Math.ceil(first.total / PAGE_SIZE), MAX_SEARCH_PAGES);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - 1) }, (_, index) => fetchFriendsPage(index + 2, PAGE_SIZE)),
  );
  return [first, ...rest].flatMap((page) => page.items);
}

/** One page of friends, newest friendship first, with the total for the pager. */
export async function fetchFriendsPage(
  page: number,
  pageSize: number,
): Promise<{ items: FriendSummary[]; total: number }> {
  const result = await api.get<Page<FriendSummary>>(`/user/friends?page=${page}&pageSize=${pageSize}`);
  return { items: result.items, total: result.total };
}

export async function fetchFriendRequests(direction: 'incoming' | 'outgoing'): Promise<FriendRequest[]> {
  return (await fetchFriendRequestsPage(direction, 1, PAGE_SIZE)).items;
}

/** One page of pending requests, newest first, with the total for the pager. */
export async function fetchFriendRequestsPage(
  direction: 'incoming' | 'outgoing',
  page: number,
  pageSize: number,
): Promise<{ items: FriendRequest[]; total: number }> {
  const result = await api.get<Page<FriendRequestResponse>>(
    `/user/friends/requests?direction=${direction}&page=${page}&pageSize=${pageSize}`,
  );
  return {
    items: result.items.map((item) => ({ ...item, createdAt: new Date(item.createdAt) })),
    total: result.total,
  };
}

/**
 * Sends a request. Resolves false rather than failing when one already exists
 * either way, or the two are already friends: the page was stale, and the
 * caller re-reads the lists to show which.
 */
export async function sendFriendRequest(targetUserId: string): Promise<boolean> {
  try {
    await api.post('/user/friends/request', { targetUserId });
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.code === 'FRIENDSHIP_ALREADY_EXISTS') return false;
    throw error;
  }
}

export async function answerFriendRequest(requestId: string, action: 'accept' | 'reject'): Promise<void> {
  await api.post(`/user/friends/${encodeURIComponent(requestId)}/${action}`);
  void refreshIncomingCount();
  if (action === 'accept') void refreshKnownFriends();
}

export async function removeFriend(friendUserId: string): Promise<void> {
  await api.delete(`/user/friends/${encodeURIComponent(friendUserId)}`);
  void refreshKnownFriends();
}

/*
 * The friends list is also the only place a user can read someone else's name
 * (orders carry ids and Telegram handles only), so the order pages name the
 * other person from it when they are friends. One copy, shared while an order
 * page is open and refreshed when a request is accepted or a friend removed.
 */
let knownFriends: FriendSummary[] = [];
const friendListeners = new Set<() => void>();
let latestFriendsRequest = 0;

async function refreshKnownFriends(): Promise<void> {
  if (friendListeners.size === 0) return;
  const request = ++latestFriendsRequest;
  try {
    const friends = await fetchFriends();
    if (request !== latestFriendsRequest) return;
    knownFriends = friends;
    for (const listener of friendListeners) listener();
  } catch {
    // Unreachable: keep the last list; the page falls back to the handle.
  }
}

function subscribeFriends(listener: () => void): () => void {
  friendListeners.add(listener);
  if (friendListeners.size === 1) void refreshKnownFriends();
  return () => {
    friendListeners.delete(listener);
    if (friendListeners.size === 0) {
      latestFriendsRequest += 1;
      knownFriends = [];
    }
  };
}

/** For a list of orders: a lookup from user id to name, for people who are friends. */
export function useFriendNames(): (userId: string | null) => string | null {
  const friends = useSyncExternalStore(subscribeFriends, () => knownFriends);
  return (userId) =>
    userId === null ? null : (friends.find((f) => f.id.toLowerCase() === userId.toLowerCase())?.name ?? null);
}

/** The person's name if they are the signed-in user's friend, else null. */
export function useFriendName(userId: string | null): string | null {
  const friends = useSyncExternalStore(subscribeFriends, () => knownFriends);
  if (userId === null) return null;
  return friends.find((f) => f.id.toLowerCase() === userId.toLowerCase())?.name ?? null;
}

/*
 * How many requests are waiting for the signed-in user, for the marker in the
 * nav. Kept the same way as the credit balance (src/lib/credit.ts): re-read
 * on navigation and when the tab regains focus, and right after answering one.
 */
let incomingCount = 0;
const listeners = new Set<() => void>();
let latestRequest = 0;

export async function refreshIncomingCount(): Promise<void> {
  const request = ++latestRequest;
  try {
    const result = await api.get<Page<FriendRequestResponse>>(
      '/user/friends/requests?direction=incoming&page=1&pageSize=1',
    );
    if (request !== latestRequest || result.total === incomingCount) return;
    incomingCount = result.total;
    for (const listener of listeners) listener();
  } catch {
    // User Service unreachable: keep the last count; the marker is a hint.
  }
}

function onFocus() {
  if (document.visibilityState === 'visible') void refreshIncomingCount();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    void refreshIncomingCount();
    document.addEventListener('visibilitychange', onFocus);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      document.removeEventListener('visibilitychange', onFocus);
      // Signed out: forget the count so the next user never sees it.
      latestRequest += 1;
      incomingCount = 0;
    }
  };
}

export function useIncomingFriendRequestCount(): number {
  return useSyncExternalStore(subscribe, () => incomingCount);
}
