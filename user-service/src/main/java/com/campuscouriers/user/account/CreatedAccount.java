/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-10-09 to 2026-10-15
 * Scope (AI-24): Generated code, configuration and tests for the specified user event, Kafka setup and outbox changes.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.account;

import com.campuscouriers.user.entity.Account;
import com.campuscouriers.user.entity.Profile;

// The persisted Account and Profile from AccountCreationService.create
public record CreatedAccount(Account account, Profile profile) {
}
