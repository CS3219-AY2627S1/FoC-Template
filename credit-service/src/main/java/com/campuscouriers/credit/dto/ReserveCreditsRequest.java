
/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-10-21 to 2026-10-22
 * Scope (AI-61): Generated the ReserveCreditsRequest DTO for the credit service, including validation constraints for userId, orderId, and amount fields.
 * Author review: Code changes were checked and validated
 */

package com.campuscouriers.credit.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.util.UUID;

public record ReserveCreditsRequest(
        @NotNull UUID userId,
        @NotNull UUID orderId, 
        @Positive long amount
) {
}