/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-10-21 to 2026-10-22
 * Scope (AI-61): Generated the CompleteReservationRequest DTO for the credit service, including validation constraints for courierUserId and orderId fields.
 * Author review: Code changes were checked and validated
 */

package com.campuscouriers.credit.dto;
 
import jakarta.validation.constraints.NotNull;
 
import java.util.UUID;

public record CompleteReservationRequest(
        @NotNull UUID courierUserId,
        @NotNull UUID orderId
) {
}