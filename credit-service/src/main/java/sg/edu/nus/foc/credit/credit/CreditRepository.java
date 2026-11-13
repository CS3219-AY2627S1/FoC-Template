/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-09-25
 * Mode: Code generation.
 * Scope: Generated Java representations of the team-finalized domain, persistence, and data contracts.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.credit;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface CreditRepository {

    RegistrationResult initializeAccount(UUID eventId, String userId, Instant occurredAt);

    Optional<CreditAccount> findAccount(String userId);

    CreditTransactionPage findTransactions(String userId, int page, int size);

    CreditTransactionPage findAllTransactions(int page, int size);

    ReservationResult reserve(String orderId, String requesterId, long amount);

    Optional<CreditReservation> findReservation(String orderId);

    void assignCourier(String orderId, String courierId);

    void holdForReopen(String orderId, String callerId);

    void refund(CreditOutcomeEvent event);

    void settle(CreditOutcomeEvent event);
}
