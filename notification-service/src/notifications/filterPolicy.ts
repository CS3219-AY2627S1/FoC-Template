/**
 * AI Assistance Disclosure:
 * Tool: Claude (Opus 5.5), date: 2026-11-10
 * Scope: SNS subscription filter policy for one user
 * Author review: Reviewed and tested locally
 */

export const filterPolicyFor = (userId: string): string => JSON.stringify({ userId: [userId] });
