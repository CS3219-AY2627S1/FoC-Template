/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-10-21 to 2026-10-22
 * Scope (AI-61): Generated the ReservationResponse DTO for the credit service, including a static factory method to convert from the Reservation entity and associated Wallet.
 * Author review: Code changes were checked and validated
 */

package com.campuscouriers.credit.dto;

import com.campuscouriers.credit.entity.Reservation;
import com.campuscouriers.credit.entity.ReservationStatus;
import com.campuscouriers.credit.entity.Wallet;

import java.util.UUID;

public record ReservationResponse(
        UUID reservationId,
        UUID orderId,
        long amount,
        ReservationStatus status
) {
    public static ReservationResponse from(Reservation reservation, Wallet wallet) {
        return new ReservationResponse(
                reservation.getReservationId(),
                reservation.getOrderId(),
                reservation.getAmount(),
                reservation.getStatus()
        );
    }
}