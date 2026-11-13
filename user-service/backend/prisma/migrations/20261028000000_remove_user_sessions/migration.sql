/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-28
 * Scope: Removed user session model after user auth implementation.
 * Author review: Verified correctness.
 */

-- Session authentication was replaced by Cognito JWT cookies.
DROP FUNCTION IF EXISTS cleanup_user_sessions(integer);
DROP TABLE IF EXISTS "user_sessions";
