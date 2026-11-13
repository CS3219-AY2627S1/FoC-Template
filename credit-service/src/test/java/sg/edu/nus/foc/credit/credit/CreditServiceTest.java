/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-14
 * Mode: Test generation and verification assistance.
 * Scope: Extended Credit service delegation coverage for system-wide transaction history.
 * Author review: Pending final human review; automated verification passed.
 */
package sg.edu.nus.foc.credit.credit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import sg.edu.nus.foc.credit.error.AccountNotFoundException;
import sg.edu.nus.foc.credit.error.InvalidCreditAmountException;
import sg.edu.nus.foc.credit.error.InvalidCreditIdException;
import sg.edu.nus.foc.credit.error.InvalidOrderEventException;
import sg.edu.nus.foc.credit.error.ReservationNotFoundException;

@ExtendWith(OutputCaptureExtension.class)
class CreditServiceTest {

    private final RecordingRepository repository = new RecordingRepository();
    private final CreditService service = new CreditService(repository);

    @Test
    void delegatesAccountReservationHistoryAndLookup(CapturedOutput output) {
        UUID eventId = UUID.randomUUID();
        Instant occurredAt = Instant.parse("2026-09-25T08:00:00Z");
        assertThat(service.initializeAccount(eventId, "user-1", occurredAt)).isSameAs(repository.registration);
        assertThat(service.getAccount("user-1")).isEqualTo(repository.account);
        assertThat(service.getTransactions("user-1", 2, 10)).isSameAs(repository.transactions);
        assertThat(service.getAllTransactions(3, 25)).isSameAs(repository.transactions);
        assertThat(service.reserve("order-1", "user-1", 5)).isSameAs(repository.reservation);
        assertThat(service.getReservation("order-1", "user-1")).isEqualTo(repository.creditReservation);
        assertThat(repository.historyPage).isEqualTo(2);
        assertThat(repository.historySize).isEqualTo(10);
        assertThat(repository.allHistoryPage).isEqualTo(3);
        assertThat(repository.allHistorySize).isEqualTo(25);
        assertThat(output).contains("credit_account_initialized").contains("credits_reserved");
    }

    @Test
    void rejectsUnsafeIdentifiersAmountsAndMissingResources(CapturedOutput output) {
        for (String invalid : new String[]{null, "", " ", ".", "..", "a/b", "__reserved__",
                "x".repeat(129)}) {
            assertThatThrownBy(() -> service.reserve(invalid, "user-1", 1))
                    .isInstanceOf(InvalidCreditIdException.class);
        }
        assertThatThrownBy(() -> service.reserve("order-1", "user-1", 0))
                .isInstanceOf(InvalidCreditAmountException.class);
        assertThatThrownBy(() -> service.getReservation("order-1", "other-user"))
                .isInstanceOf(ReservationNotFoundException.class);
        repository.accountFound = Optional.empty();
        assertThatThrownBy(() -> service.getAccount("missing"))
                .isInstanceOf(AccountNotFoundException.class);
        assertThatThrownBy(() -> service.getTransactions("missing", 1, 20))
                .isInstanceOf(AccountNotFoundException.class);
        assertThat(output).contains("credit_operation_failed");
    }

    @Test
    void delegatesAssignmentHoldRefundAndCompletion(CapturedOutput output) {
        service.assignCourier("order-1", "courier-1");
        service.holdForReopen("order-1", "courier-1");
        CreditOutcomeEvent refund = outcome(CreditOutcomeType.OPEN_ORDER_REFUND, null, "CANCELLED");
        CreditOutcomeEvent expired = outcome(CreditOutcomeType.OPEN_ORDER_REFUND, null, "EXPIRED");
        CreditOutcomeEvent completion = outcome(CreditOutcomeType.ORDER_COMPLETION, "courier-1", "COMPLETED");

        service.processOutcome(refund);
        service.processOutcome(expired);
        service.processOutcome(completion);

        assertThat(repository.assignedCourier).isEqualTo("courier-1");
        assertThat(repository.holdCaller).isEqualTo("courier-1");
        assertThat(repository.refund).isSameAs(expired);
        assertThat(repository.settlement).isSameAs(completion);
        assertThat(output).contains("credits_refunded orderId=order-1 amount=5 reason=CANCELLED")
                .contains("credits_transferred courierId=courier-1 orderId=order-1 amount=5");
    }

    @Test
    void validatesOnlyCompactFinancialFacts() {
        CreditOutcomeEvent valid = outcome(CreditOutcomeType.OPEN_ORDER_REFUND, null, "CANCELLED");
        for (CreditOutcomeEvent invalid : new CreditOutcomeEvent[]{
                null,
                new CreditOutcomeEvent(null, valid.type(), valid.orderId(), valid.orderStatus(), 5,
                        valid.occurredAt(), null),
                new CreditOutcomeEvent(valid.eventId(), null, valid.orderId(), valid.orderStatus(), 5,
                        valid.occurredAt(), null),
                new CreditOutcomeEvent(valid.eventId(), valid.type(), valid.orderId(), valid.orderStatus(), 0,
                        valid.occurredAt(), null),
                new CreditOutcomeEvent(valid.eventId(), valid.type(), valid.orderId(), "OPEN", 5,
                        valid.occurredAt(), null),
                outcome(CreditOutcomeType.ORDER_COMPLETION, null, "COMPLETED"),
                outcome(CreditOutcomeType.ORDER_COMPLETION, "courier-1", "OPEN")}) {
            assertThatThrownBy(() -> service.processOutcome(invalid))
                    .isInstanceOf(InvalidOrderEventException.class);
        }
    }

    private static CreditOutcomeEvent outcome(CreditOutcomeType type, String courierId, String status) {
        return new CreditOutcomeEvent("event-1", type, "order-1", status, 5, Instant.EPOCH, courierId);
    }

    private static final class RecordingRepository implements CreditRepository {
        private final CreditAccount account = new CreditAccount("user-1", 50, 0, Instant.EPOCH, Instant.EPOCH);
        private final CreditReservation creditReservation = new CreditReservation("order-1", "user-1", null,
                5, ReservationStatus.RESERVED, Instant.EPOCH, Instant.EPOCH, null, null);
        private final RegistrationResult registration = new RegistrationResult(account, true);
        private final ReservationResult reservation = new ReservationResult(creditReservation, account, true);
        private final CreditTransactionPage transactions = new CreditTransactionPage(List.of(), 2, 10, 0, 0);
        private Optional<CreditReservation> found = Optional.of(creditReservation);
        private Optional<CreditAccount> accountFound = Optional.of(account);
        private int historyPage;
        private int historySize;
        private int allHistoryPage;
        private int allHistorySize;
        private String assignedCourier;
        private String holdCaller;
        private CreditOutcomeEvent refund;
        private CreditOutcomeEvent settlement;

        @Override public RegistrationResult initializeAccount(UUID eventId, String userId, Instant occurredAt) { return registration; }
        @Override public Optional<CreditAccount> findAccount(String userId) { return accountFound; }
        @Override public CreditTransactionPage findTransactions(String userId, int page, int size) { historyPage = page; historySize = size; return transactions; }
        @Override public CreditTransactionPage findAllTransactions(int page, int size) { allHistoryPage = page; allHistorySize = size; return transactions; }
        @Override public ReservationResult reserve(String orderId, String requesterId, long amount) { return reservation; }
        @Override public Optional<CreditReservation> findReservation(String orderId) { return found; }
        @Override public void assignCourier(String orderId, String courierId) { assignedCourier = courierId; }
        @Override public void holdForReopen(String orderId, String callerId) { holdCaller = callerId; }
        @Override public void refund(CreditOutcomeEvent event) { refund = event; }
        @Override public void settle(CreditOutcomeEvent event) { settlement = event; }
    }
}
