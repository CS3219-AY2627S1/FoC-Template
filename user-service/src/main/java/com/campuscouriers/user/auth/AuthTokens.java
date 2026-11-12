/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-09-18 to 2026-10-03
 * Scope (AI-23): Generated code and tests for the User Service endpoints, entities, validation and token handling I specified.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.auth;

// Tokens issued for a session; the controller returns the access token in the body and the refresh token as a cookie
public record AuthTokens(
        String accessToken,
        String refreshToken,
        long expiresIn
) {

}
