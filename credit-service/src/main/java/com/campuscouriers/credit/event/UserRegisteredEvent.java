/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-10-21
 * Scope (AI-61): Generated the UserRegisteredEvent record for the credit service
 * Author review: Code changes were checked and validated
 */

package com.campuscouriers.credit.event;

import java.util.UUID;


public record UserRegisteredEvent(
        UUID userId,
        String type
) {

    public static final String TYPE = "user.registered";
}