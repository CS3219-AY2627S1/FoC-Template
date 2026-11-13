/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-07
 * Mode: Test generation and testing assistance.
 * Scope: Generated PostgreSQL integration tests for transactions, idempotency, constraints, and concurrency.
 * Author review: I reviewed for correctness and added boundary cases.
 */
package sg.edu.nus.foc.credit.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.sql.Timestamp;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import sg.edu.nus.foc.credit.credit.RegistrationResult;
import sg.edu.nus.foc.credit.credit.ReservationResult;
import sg.edu.nus.foc.credit.credit.ReservationStatus;
import sg.edu.nus.foc.credit.credit.CreditOutcomeEvent;
import sg.edu.nus.foc.credit.credit.CreditOutcomeType;
import sg.edu.nus.foc.credit.credit.CreditDirection;
import sg.edu.nus.foc.credit.credit.CreditTransactionPage;
import sg.edu.nus.foc.credit.credit.CreditTransactionType;
import sg.edu.nus.foc.credit.error.AccountNotFoundException;
import sg.edu.nus.foc.credit.error.EventConflictException;
import sg.edu.nus.foc.credit.error.InsufficientCreditsException;
import sg.edu.nus.foc.credit.error.ReservationConflictException;
import sg.edu.nus.foc.credit.error.ForbiddenException;
import sg.edu.nus.foc.credit.error.ReservationNotFoundException;
import sg.edu.nus.foc.credit.error.ReservationStateConflictException;
import sg.edu.nus.foc.credit.support.PostgreSqlTestContainer;

@SpringBootTest
class JpaCreditRepositoryIntegrationTest {

    private static final Instant OCCURRED_AT = Instant.parse("2026-09-25T08:00:00Z");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        PostgreSqlTestContainer.register(registry);
    }

    @Autowired
    private JpaCreditRepository repository;

    @Autowired
    private JdbcTemplate jdbc;

    @BeforeEach
    void reset() {
        jdbc.execute("truncate table credit_ledger, credit_reservations, "
                + "credit_idempotency_records, credit_accounts cascade");
    }

    @Test
    void initializesExactlyOnceAndRecordsConsistentRows() {
        UUID eventId = UUID.randomUUID();
        RegistrationResult first = repository.initializeAccount(eventId, "user-1", OCCURRED_AT);
        RegistrationResult replay = repository.initializeAccount(eventId, "user-1", OCCURRED_AT);

        assertThat(first.created()).isTrue();
        assertThat(replay.created()).isFalse();
        assertThat(first.account()).isEqualTo(replay.account());
        assertThat(first.account().totalBalance()).isEqualTo(50);
        assertThat(first.account().reservedBalance()).isZero();
        assertThat(first.account().usableBalance()).isEqualTo(50);
        assertThat(repository.findAccount("user-1")).contains(first.account());
        assertThat(repository.findAccount("missing")).isEmpty();
        assertThat(count("credit_accounts")).isOne();
        assertThat(count("credit_idempotency_records")).isOne();
        assertThat(count("credit_ledger")).isOne();
        assertThat(jdbc.queryForObject(
                "select operation from credit_idempotency_records", String.class))
                .isEqualTo(IdempotencyOperation.USER_REGISTERED.name());
        assertThat(jdbc.queryForObject("select effect_type from credit_ledger", String.class))
                .isEqualTo("INITIAL_ALLOCATION");
    }

    @Test
    void newRegistrationEventDoesNotAllocateAgainAndConflictingReplayFails() {
        UUID firstEvent = UUID.randomUUID();
        repository.initializeAccount(firstEvent, "user-1", OCCURRED_AT);

        RegistrationResult repeatedRegistration = repository.initializeAccount(
                UUID.randomUUID(), "user-1", OCCURRED_AT);

        assertThat(repeatedRegistration.created()).isFalse();
        assertThat(count("credit_idempotency_records")).isEqualTo(2);
        assertThat(count("credit_ledger")).isOne();
        assertThatThrownBy(() -> repository.initializeAccount(firstEvent, "user-2", OCCURRED_AT))
                .isInstanceOf(EventConflictException.class);
    }

    @Test
    void reservesByOrderIdAndWritesOneLedgerEntry() {
        repository.initializeAccount(UUID.randomUUID(), "user-1", OCCURRED_AT);

        ReservationResult first = repository.reserve("order-1", "user-1", 20);
        ReservationResult replay = repository.reserve("order-1", "user-1", 20);

        assertThat(first.created()).isTrue();
        assertThat(replay.created()).isFalse();
        assertThat(first.reservation().status()).isEqualTo(ReservationStatus.RESERVED);
        assertThat(first.account().totalBalance()).isEqualTo(50);
        assertThat(first.account().reservedBalance()).isEqualTo(20);
        assertThat(first.account().usableBalance()).isEqualTo(30);
        assertThat(repository.findReservation("order-1")).contains(first.reservation());
        assertThat(repository.findReservation("missing")).isEmpty();
        assertThat(count("credit_reservations")).isOne();
        assertThat(count("credit_ledger")).isEqualTo(2);
    }

    @Test
    void rejectsFailuresWithoutPartialWrites() {
        assertThatThrownBy(() -> repository.reserve("order-1", "missing", 1))
                .isInstanceOf(AccountNotFoundException.class);
        repository.initializeAccount(UUID.randomUUID(), "user-1", OCCURRED_AT);

        assertThatThrownBy(() -> repository.reserve("order-1", "user-1", 51))
                .isInstanceOf(InsufficientCreditsException.class);
        assertThat(count("credit_reservations")).isZero();

        repository.reserve("order-1", "user-1", 20);
        assertThatThrownBy(() -> repository.reserve("order-1", "user-1", 21))
                .isInstanceOf(ReservationConflictException.class);
        assertThatThrownBy(() -> repository.reserve("order-1", "different-user", 20))
                .isInstanceOf(ReservationConflictException.class);
        assertThat(count("credit_reservations")).isOne();
    }

    @Test
    void concurrentReservationsCannotOverdrawTheAccount() {
        repository.initializeAccount(UUID.randomUUID(), "user-1", OCCURRED_AT);

        CompletableFuture<ReservationResult> first = CompletableFuture.supplyAsync(
                () -> repository.reserve("order-a", "user-1", 30));
        CompletableFuture<ReservationResult> second = CompletableFuture.supplyAsync(
                () -> repository.reserve("order-b", "user-1", 30));

        long successes = List.of(first, second).stream().filter(future -> {
            try {
                future.join();
                return true;
            } catch (CompletionException exception) {
                assertThat(exception.getCause()).isInstanceOf(InsufficientCreditsException.class);
                return false;
            }
        }).count();

        assertThat(successes).isOne();
        assertThat(count("credit_reservations")).isOne();
        assertThat(jdbc.queryForObject(
                "select reserved_balance from credit_accounts where user_id = 'user-1'", Long.class))
                .isEqualTo(30);
    }

    @Test
    void databaseConstraintsRejectCorruptFinancialRows() {
        assertThatThrownBy(() -> jdbc.update("""
                insert into credit_accounts
                    (user_id, total_balance, reserved_balance, created_at, updated_at)
                values ('negative', -1, 0, now(), now())
                """)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("""
                insert into credit_accounts
                    (user_id, total_balance, reserved_balance, created_at, updated_at)
                values ('over-reserved', 10, 11, now(), now())
                """)).isInstanceOf(DataIntegrityViolationException.class);

        repository.initializeAccount(UUID.randomUUID(), "user-1", OCCURRED_AT);
        assertThatThrownBy(() -> jdbc.update("""
                insert into credit_reservations
                    (order_id, requester_id, amount, status, created_at, updated_at)
                values ('invalid-status', 'user-1', 1, 'UNKNOWN', now(), now())
                """)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("""
                insert into credit_reservations
                    (order_id, requester_id, amount, status, created_at, updated_at, paid_at)
                values ('bad-order', 'user-1', 1, 'RESERVED', now(), now(), now())
                """)).isInstanceOf(DataIntegrityViolationException.class);
        repository.initializeAccount(UUID.randomUUID(), "user-2", OCCURRED_AT);
        assertThatThrownBy(() -> jdbc.update("""
                insert into credit_ledger
                    (entry_id, user_id, origin_type, origin_id, effect_type, amount,
                     total_balance_delta, reserved_balance_delta, occurred_at, created_at)
                select ?, 'user-2', origin_type, origin_id, effect_type, amount,
                       total_balance_delta, reserved_balance_delta, occurred_at, now()
                from credit_ledger
                where user_id = 'user-1'
                """, UUID.randomUUID())).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void payloadHashesAreStableAndSensitiveToBusinessFields() {
        String first = JpaCreditRepository.payloadHash(
                IdempotencyOperation.USER_REGISTERED, "user-1", null, OCCURRED_AT);
        assertThat(first).hasSize(64)
                .isEqualTo(JpaCreditRepository.payloadHash(
                        IdempotencyOperation.USER_REGISTERED, "user-1", null, OCCURRED_AT))
                .isNotEqualTo(JpaCreditRepository.payloadHash(
                        IdempotencyOperation.USER_REGISTERED, "user-2", null, OCCURRED_AT));
    }

    @Test
    void assignsAndClearsCourierWithoutMovingReservedFunds() {
        createAccount("requester");
        createAccount("courier-1");
        createAccount("courier-2");
        repository.reserve("order-1", "requester", 10);

        repository.assignCourier("order-1", "courier-1");
        repository.assignCourier("order-1", "courier-1");
        assertThatThrownBy(() -> repository.assignCourier("order-1", "courier-2"))
                .isInstanceOf(ReservationStateConflictException.class);
        assertThatThrownBy(() -> repository.holdForReopen("order-1", "courier-2"))
                .isInstanceOf(ForbiddenException.class);

        repository.holdForReopen("order-1", "courier-1");
        repository.holdForReopen("order-1", "courier-1");

        assertThat(repository.findReservation("order-1").orElseThrow().courierId()).isNull();
        assertThat(repository.findAccount("requester").orElseThrow().reservedBalance()).isEqualTo(10);
        assertThat(count("credit_ledger")).isEqualTo(4);
    }

    @Test
    void assignmentRequiresAnActiveReservationAndRegisteredCourier() {
        createAccount("requester");
        repository.reserve("order-1", "requester", 10);

        assertThatThrownBy(() -> repository.assignCourier("missing", "courier"))
                .isInstanceOf(ReservationNotFoundException.class);
        assertThatThrownBy(() -> repository.assignCourier("order-1", "courier"))
                .isInstanceOf(AccountNotFoundException.class);

        repository.refund(outcome("refund-1", CreditOutcomeType.OPEN_ORDER_REFUND,
                "CANCELLED", null));
        assertThatThrownBy(() -> repository.holdForReopen("order-1", "requester"))
                .isInstanceOf(ReservationStateConflictException.class);
    }

    @Test
    void refundsCancellationAndExpiryEventsExactlyOnce() {
        createAccount("requester");
        createAccount("courier");
        repository.reserve("open-order", "requester", 10);
        CreditOutcomeEvent openRefund = outcomeForOrder(
                "refund-open", CreditOutcomeType.OPEN_ORDER_REFUND,
                "open-order", 10, "EXPIRED", null);

        repository.refund(openRefund);
        repository.refund(openRefund);
        assertThat(repository.findReservation("open-order").orElseThrow().status())
                .isEqualTo(ReservationStatus.REFUNDED);
        assertThat(jdbc.queryForObject(
                "select status from credit_reservations where order_id = 'open-order'", String.class))
                .isEqualTo("REFUNDED");
        assertThat(repository.findAccount("requester").orElseThrow().reservedBalance()).isZero();
        assertThat(count("credit_ledger")).isEqualTo(4);
        assertThat(jdbc.queryForObject(
                "select refund_reason from credit_ledger where order_id = 'open-order' and effect_type = 'REFUND'",
                String.class)).isEqualTo("EXPIRY");

        repository.reserve("cancelled-order", "requester", 7);
        repository.refund(outcomeForOrder(
                "refund-cancelled", CreditOutcomeType.OPEN_ORDER_REFUND,
                "cancelled-order", 7, "CANCELLED", null));
        assertThat(jdbc.queryForObject(
                "select status from credit_reservations where order_id = 'cancelled-order'", String.class))
                .isEqualTo("REFUNDED");
        assertThatThrownBy(() -> repository.refund(new CreditOutcomeEvent(
                "refund-open", CreditOutcomeType.OPEN_ORDER_REFUND, "open-order", "EXPIRED",
                11, OCCURRED_AT, null)))
                .isInstanceOf(EventConflictException.class);
    }

    @Test
    void verifiesRefundCourierAgainstAuthoritativeReservation() {
        createAccount("requester");
        createAccount("courier");
        repository.reserve("order-1", "requester", 10);
        repository.assignCourier("order-1", "courier");
        assertThatThrownBy(() -> repository.refund(outcome(
                "refund-mismatch", CreditOutcomeType.OPEN_ORDER_REFUND,
                "EXPIRED", null)))
                .isInstanceOf(ReservationStateConflictException.class);
        repository.holdForReopen("order-1", "courier");
        repository.refund(outcome("refund-after-hold", CreditOutcomeType.OPEN_ORDER_REFUND,
                "EXPIRED", null));
        assertThat(repository.findReservation("order-1").orElseThrow().status())
                .isEqualTo(ReservationStatus.REFUNDED);
    }

    @Test
    void rejectsMissingReservationAndMismatchedCompactFinancialFacts() {
        createAccount("requester");
        createAccount("courier");
        assertThatThrownBy(() -> repository.refund(outcomeForOrder(
                "missing", CreditOutcomeType.OPEN_ORDER_REFUND,
                "missing-order", 10, "EXPIRED", null)))
                .isInstanceOf(ReservationNotFoundException.class);

        repository.reserve("order-1", "requester", 10);
        assertThatThrownBy(() -> repository.refund(new CreditOutcomeEvent(
                "wrong-amount", CreditOutcomeType.OPEN_ORDER_REFUND, "order-1", "CANCELLED",
                11, OCCURRED_AT, null)))
                .isInstanceOf(ReservationStateConflictException.class);
        assertThat(repository.findReservation("order-1").orElseThrow().status())
                .isEqualTo(ReservationStatus.RESERVED);
    }

    @Test
    void readsStableNewestFirstHistoryAndMapsLegacyRefunds() {
        createAccount("requester");
        repository.reserve("order-1", "requester", 10);
        repository.refund(outcome("refund-1", CreditOutcomeType.OPEN_ORDER_REFUND,
                "CANCELLED", null));
        jdbc.update("""
                insert into credit_ledger
                    (entry_id, user_id, order_id, origin_type, origin_id, effect_type, amount,
                     total_balance_delta, reserved_balance_delta, occurred_at, created_at, refund_reason)
                values (?, 'requester', 'legacy-order', 'LEGACY_REFUND', 'legacy-refund',
                        'REFUND', 3, 0, -3, ?, ?, null)
                """, UUID.randomUUID(), Timestamp.from(Instant.parse("2099-01-01T00:00:00Z")),
                Timestamp.from(Instant.parse("2099-01-01T00:00:00Z")));

        CreditTransactionPage first = repository.findTransactions("requester", 1, 2);
        assertThat(first.items()).hasSize(2);
        assertThat(first.items().getFirst().type()).isEqualTo(CreditTransactionType.REFUNDED);
        assertThat(first.items().getFirst().direction()).isEqualTo(CreditDirection.CREDIT);
        assertThat(first.items().getFirst().orderId()).isEqualTo("legacy-order");
        assertThat(first.totalItems()).isEqualTo(4);
        assertThat(first.totalPages()).isEqualTo(2);

        CreditTransactionPage all = repository.findTransactions("requester", 1, 10);
        assertThat(all.items()).extracting(transaction -> transaction.type())
                .containsExactlyInAnyOrder(
                        CreditTransactionType.REFUNDED,
                        CreditTransactionType.REFUNDED_CANCELLATION,
                        CreditTransactionType.RESERVATION,
                        CreditTransactionType.INITIAL_ALLOCATION);
        assertThat(all.items()).extracting(transaction -> transaction.occurredAt())
                .isSortedAccordingTo(java.util.Comparator.reverseOrder());
    }

    @Test
    void readsStableNewestFirstHistoryAcrossUsers() {
        repository.initializeAccount(
                UUID.randomUUID(), "older-user", Instant.parse("2026-09-24T08:00:00Z"));
        repository.initializeAccount(
                UUID.randomUUID(), "newer-user", Instant.parse("2026-09-25T08:00:00Z"));
        repository.reserve("newest-order", "older-user", 10);

        CreditTransactionPage first = repository.findAllTransactions(1, 2);
        assertThat(first.items()).hasSize(2);
        assertThat(first.items().getFirst().userId()).isEqualTo("older-user");
        assertThat(first.items().getFirst().orderId()).isEqualTo("newest-order");
        assertThat(first.items().get(1).userId()).isEqualTo("newer-user");
        assertThat(first.totalItems()).isEqualTo(3);
        assertThat(first.totalPages()).isEqualTo(2);

        CreditTransactionPage second = repository.findAllTransactions(2, 2);
        assertThat(second.items()).singleElement()
                .satisfies(transaction -> assertThat(transaction.userId()).isEqualTo("older-user"));
        assertThat(first.items()).extracting(transaction -> transaction.occurredAt())
                .isSortedAccordingTo(java.util.Comparator.reverseOrder());
    }

    @Test
    void settlesCompletionToTheRecordedCourierExactlyOnce() {
        createAccount("requester");
        createAccount("courier");
        createAccount("other-courier");
        repository.reserve("order-1", "requester", 10);
        repository.assignCourier("order-1", "courier");
        CreditOutcomeEvent completion = outcome(
                "complete-1", CreditOutcomeType.ORDER_COMPLETION, "COMPLETED", "courier");

        repository.settle(completion);
        repository.settle(completion);

        assertThat(repository.findAccount("requester").orElseThrow().totalBalance()).isEqualTo(40);
        assertThat(repository.findAccount("requester").orElseThrow().reservedBalance()).isZero();
        assertThat(repository.findAccount("courier").orElseThrow().totalBalance()).isEqualTo(60);
        assertThat(jdbc.queryForObject(
                "select status from credit_reservations where order_id = 'order-1'", String.class))
                .isEqualTo("PAID");
        assertThat(count("credit_ledger")).isEqualTo(6);

        assertThatThrownBy(() -> repository.settle(new CreditOutcomeEvent(
                "complete-bad", CreditOutcomeType.ORDER_COMPLETION, "order-1", "COMPLETED",
                10, OCCURRED_AT, "other-courier")))
                .isInstanceOf(ReservationStateConflictException.class);
    }

    private void createAccount(String userId) {
        repository.initializeAccount(UUID.randomUUID(), userId, OCCURRED_AT);
    }

    private CreditOutcomeEvent outcome(String eventId, CreditOutcomeType type, String status,
                                       String courierId) {
        return outcomeForOrder(eventId, type, "order-1", 10, status, courierId);
    }

    private CreditOutcomeEvent outcomeForOrder(String eventId, CreditOutcomeType type, String orderId,
                                               long amount, String status, String courierId) {
        return new CreditOutcomeEvent(eventId, type, orderId, status, amount, OCCURRED_AT, courierId);
    }

    private long count(String table) {
        return jdbc.queryForObject("select count(*) from " + table, Long.class);
    }
}
