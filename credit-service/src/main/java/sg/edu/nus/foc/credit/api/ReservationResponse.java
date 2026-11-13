/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-09-25
 * Mode: Code generation.
 * Scope: Generated the initial HTTP API, validation, ownership enforcement, response mapping, or API types from the team-finalized interface contract.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.api;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonInclude;
import sg.edu.nus.foc.credit.credit.CreditAccount;
import sg.edu.nus.foc.credit.credit.CreditReservation;
import sg.edu.nus.foc.credit.credit.ReservationStatus;

@JsonInclude(JsonInclude.Include.ALWAYS)
public record ReservationResponse(
        String orderId,
        String requesterId,
        String courierId,
        long amount,
        ReservationStatus status,
        @JsonInclude(JsonInclude.Include.NON_NULL) BalanceResponse balance,
        Instant createdAt,
        Instant updatedAt,
        Instant refundedAt,
        Instant paidAt) {

    static ReservationResponse from(CreditReservation reservation, CreditAccount account) {
        return new ReservationResponse(reservation.orderId(), reservation.requesterId(), reservation.courierId(),
                reservation.amount(), reservation.status(), BalanceResponse.from(account), reservation.createdAt(),
                reservation.updatedAt(), reservation.refundedAt(), reservation.paidAt());
    }

    static ReservationResponse from(CreditReservation reservation) {
        return new ReservationResponse(reservation.orderId(), reservation.requesterId(), reservation.courierId(),
                reservation.amount(), reservation.status(), null, reservation.createdAt(), reservation.updatedAt(),
                reservation.refundedAt(), reservation.paidAt());
    }
}
