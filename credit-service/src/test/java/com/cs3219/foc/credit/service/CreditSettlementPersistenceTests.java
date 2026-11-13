package com.cs3219.foc.credit.service;

import static org.assertj.core.api.Assertions.*;

import com.cs3219.foc.credit.config.CreditProperties;
import com.cs3219.foc.credit.exception.*;
import com.cs3219.foc.credit.integration.AbstractIntegrationTest;
import com.cs3219.foc.credit.model.dto.*;
import com.cs3219.foc.credit.model.dto.event.*;
import com.cs3219.foc.credit.repository.CreditAccountRepository;
import com.cs3219.foc.credit.security.AuthenticatedUserResolver;
import com.cs3219.foc.credit.security.AuthenticationContextService;
import com.cs3219.foc.credit.security.CurrentUserService;
import java.time.OffsetDateTime;
import java.util.UUID;
import java.util.concurrent.*;
import javax.sql.DataSource;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.*;
import org.springframework.context.event.EventListener;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.orm.jpa.*;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@Import(CreditSettlementPersistenceTests.TestConfig.class)
class CreditSettlementPersistenceTests extends AbstractIntegrationTest {

    @Autowired
    private CreditReservationService reserve;

    @Autowired
    private CreditPaymentService payment;

    @Autowired
    private CreditRefundService refund;

    @Autowired
    private CreditAccountService creditAccountService;

    @Autowired
    private DataSource dataSource;

    private JdbcTemplate jdbc;

    @BeforeEach
    void clean() {
        jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("TRUNCATE credit_accounts CASCADE");
    }

    private UUID fund(long amount) {
        var user = UUID.randomUUID();
        creditAccountService.initializeAccount(user);
        jdbc.update("UPDATE credit_accounts SET total_balance = ? WHERE user_id = ?", amount, user);
        return user;
    }

    private ReserveCreditRequest request(long amount) {
        return new ReserveCreditRequest(UUID.randomUUID(), UUID.randomUUID(), amount);
    }

    private long count(String table) {
        return jdbc.queryForObject("SELECT count(*) FROM " + table, Long.class);
    }

    private void concurrent(Runnable first, Runnable second) throws Exception {
        var barrier = new CyclicBarrier(2);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var a = executor.submit(() -> {
                barrier.await(10, TimeUnit.SECONDS);
                first.run();
                return true;
            });
            var b = executor.submit(() -> {
                barrier.await(10, TimeUnit.SECONDS);
                second.run();
                return true;
            });
            assertThat(a.get(20, TimeUnit.SECONDS)).isTrue();
            assertThat(b.get(20, TimeUnit.SECONDS)).isTrue();
        }
    }

    @Autowired
    private Results results;

    @BeforeEach
    void clearResults() {
        results.events.clear();
    }

    record Confirmation(UUID eventId, UUID operationId, String outcome) {}

    static class Results {
        final CopyOnWriteArrayList<Confirmation> events = new CopyOnWriteArrayList<>();

        @EventListener
        public void paid(CreditPaidEvent event) {
            events.add(new Confirmation(event.eventId(), event.payload().operationId(), "PAID"));
        }

        @EventListener
        public void paymentDeclined(CreditPaymentDeclinedEvent event) {
            events.add(new Confirmation(
                    event.eventId(),
                    event.payload().operationId(),
                    event.payload().reason()));
        }

        @EventListener
        public void refunded(CreditRefundedEvent event) {
            events.add(new Confirmation(event.eventId(), event.payload().operationId(), "REFUNDED"));
        }

        @EventListener
        public void refundDeclined(CreditRefundDeclinedEvent event) {
            events.add(new Confirmation(
                    event.eventId(),
                    event.payload().operationId(),
                    event.payload().reason()));
        }
    }

    private ErrandCancelledEvent cancelled(UUID user, ReserveCreditRequest r) {
        return new ErrandCancelledEvent(
                UUID.randomUUID(),
                1,
                OffsetDateTime.now(),
                new ErrandCancelledEvent.Payload(r.errandId(), user, r.amount()));
    }

    private ErrandExpiredEvent expired(UUID user, ReserveCreditRequest r) {
        return new ErrandExpiredEvent(
                UUID.randomUUID(),
                1,
                OffsetDateTime.now(),
                new ErrandExpiredEvent.Payload(r.errandId(), user, r.amount()));
    }

    private ErrandCompletedEvent completed(UUID user, ReserveCreditRequest r, UUID courier) {
        return new ErrandCompletedEvent(
                UUID.randomUUID(),
                1,
                OffsetDateTime.now(),
                new ErrandCompletedEvent.Payload(r.errandId(), user, r.amount(), courier));
    }

    private ReserveCreditRequest reserved(UUID user, long amount) {
        var r = request(amount);
        assertThat(reserve.reserve(user, r).outcome()).isEqualTo("RESERVED");
        return r;
    }

    private String outcome() {
        return results.events.getLast().outcome();
    }

    @Test
    void cancellationAndExpiryRefundOnceIncludingDifferentEvents() throws Exception {
        var user = fund(100);
        var r = reserved(user, 80);
        var cancel = cancelled(user, r);
        concurrent(() -> refund.releaseReservedCredits(cancel), () -> refund.releaseReservedCredits(expired(user, r)));
        refund.releaseReservedCredits(cancel);
        assertThat(creditAccountService.getBalance(user)).isEqualTo(new CreditBalanceResponse(100, 0));
        assertThat(count("credit_transaction_log")).isEqualTo(2);
        assertThat(jdbc.queryForList("SELECT transaction_type FROM credit_transaction_log", String.class))
                .containsExactlyInAnyOrder("RESERVE", "REFUND");
        assertThat(reserve.reserve(user, r).outcome()).isEqualTo("RESERVED");
    }

    @Test
    void payoutTransfersOnceAndRejectsDifferentCourierOrTerminalEffect() {
        var user = fund(100);
        var courier = fund(7);
        var other = fund(0);
        var r = reserved(user, 80);
        var paid = completed(user, r, courier);
        payment.transferReservedCredits(paid);
        payment.transferReservedCredits(paid);
        assertThat(outcome()).isEqualTo("PAID");
        assertThat(results.events.getLast().operationId()).isEqualTo(paid.eventId());
        payment.transferReservedCredits(completed(user, r, courier));
        assertThat(outcome()).isEqualTo("PAID");
        payment.transferReservedCredits(completed(user, r, other));
        assertThat(outcome()).isEqualTo("TERMINAL_CONFLICT");
        refund.releaseReservedCredits(cancelled(user, r));
        assertThat(outcome()).isEqualTo("TERMINAL_CONFLICT");
        assertThat(creditAccountService.getBalance(user)).isEqualTo(new CreditBalanceResponse(20, 0));
        assertThat(creditAccountService.getBalance(courier)).isEqualTo(new CreditBalanceResponse(87, 0));
        assertThat(creditAccountService.getBalance(other)).isEqualTo(new CreditBalanceResponse(0, 0));
        assertThat(count("credit_transaction_log")).isEqualTo(2);
    }

    @Test
    void missingCourierRollsBackThenQueueRedeliveryCanSucceed() {
        var user = fund(100);
        var courier = UUID.randomUUID();
        var r = reserved(user, 80);
        var paid = completed(user, r, courier);
        assertThatThrownBy(() -> payment.transferReservedCredits(paid))
                .isInstanceOf(CreditAccountPendingException.class);
        assertThat(results.events).isEmpty();
        assertThat(count("credit_transaction_log")).isEqualTo(1);
        assertThat(creditAccountService.getBalance(user)).isEqualTo(new CreditBalanceResponse(20, 80));
        creditAccountService.initializeAccount(courier);
        payment.transferReservedCredits(paid);
        assertThat(creditAccountService.getBalance(courier)).isEqualTo(new CreditBalanceResponse(95, 0));
    }

    @Test
    void settlementBeforeReservationRetriesAndRejectedReservationHasNoEffect() {
        var user = fund(100);
        var r = request(80);
        var cancel = cancelled(user, r);
        assertThatThrownBy(() -> refund.releaseReservedCredits(cancel)).isInstanceOf(IllegalStateException.class);
        reserve.reserve(user, r);
        refund.releaseReservedCredits(cancel);
        assertThat(outcome()).isEqualTo("REFUNDED");
        var rejected = request(200);
        reserve.reserve(user, rejected);
        refund.releaseReservedCredits(cancelled(user, rejected));
        assertThat(outcome()).isEqualTo("NO_RESERVATION");
        assertThat(creditAccountService.getBalance(user)).isEqualTo(new CreditBalanceResponse(100, 0));
        assertThat(count("credit_transaction_log")).isEqualTo(2);
    }

    @Test
    void mismatchedReservationCannotMoveCredits() {
        var user = fund(100);
        var r = reserved(user, 80);
        for (long amount : new long[] {70, 0, -1}) {
            var wrongAmount = new ReserveCreditRequest(r.operationId(), r.errandId(), amount);
            refund.releaseReservedCredits(cancelled(user, wrongAmount));
            assertThat(outcome()).isEqualTo("RESERVATION_MISMATCH");
            payment.transferReservedCredits(completed(user, wrongAmount, UUID.randomUUID()));
            assertThat(outcome()).isEqualTo("RESERVATION_MISMATCH");
        }
        refund.releaseReservedCredits(cancelled(UUID.randomUUID(), r));
        assertThat(outcome()).isEqualTo("RESERVATION_MISMATCH");
        assertThat(creditAccountService.getBalance(user)).isEqualTo(new CreditBalanceResponse(20, 80));
        assertThat(count("credit_transaction_log")).isEqualTo(1);
    }

    @Test
    void correctedRejectedEventPublishesDistinctResultIdentity() {
        var user = fund(100);
        var r = reserved(user, 80);
        var corrected = cancelled(user, r);
        var rejected = new ErrandCancelledEvent(
                corrected.eventId(),
                1,
                corrected.occurredAt(),
                new ErrandCancelledEvent.Payload(r.errandId(), user, 70));

        refund.releaseReservedCredits(rejected);
        var rejectedResult = results.events.getLast();
        assertThat(rejectedResult.outcome()).isEqualTo("RESERVATION_MISMATCH");
        assertThat(creditAccountService.getBalance(user)).isEqualTo(new CreditBalanceResponse(20, 80));

        refund.releaseReservedCredits(corrected);
        var correctedResult = results.events.getLast();
        assertThat(correctedResult.outcome()).isEqualTo("REFUNDED");
        assertThat(correctedResult.operationId()).isEqualTo(corrected.eventId());
        assertThat(correctedResult.operationId()).isEqualTo(rejectedResult.operationId());
        assertThat(correctedResult.eventId()).isNotEqualTo(rejectedResult.eventId());
        assertThat(creditAccountService.getBalance(user)).isEqualTo(new CreditBalanceResponse(100, 0));
        assertThat(count("credit_transaction_log")).isEqualTo(2);
    }

    @Test
    void processedEventIdCannotBeReusedWithChangedFacts() {
        var user = fund(100);
        var r = reserved(user, 40);
        var second = reserved(user, 40);
        var cancel = cancelled(user, r);
        refund.releaseReservedCredits(cancel);
        var changed = new ErrandCancelledEvent(
                cancel.eventId(),
                1,
                cancel.occurredAt(),
                new ErrandCancelledEvent.Payload(second.errandId(), user, 40));
        assertThatThrownBy(() -> refund.releaseReservedCredits(changed)).isInstanceOf(IllegalArgumentException.class);
        var changedAmount = new ErrandCancelledEvent(
                cancel.eventId(), 1, cancel.occurredAt(), new ErrandCancelledEvent.Payload(r.errandId(), user, 30));
        assertThatThrownBy(() -> refund.releaseReservedCredits(changedAmount))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(creditAccountService.getBalance(user)).isEqualTo(new CreditBalanceResponse(60, 40));
    }

    @Test
    void recipientWriteFailureRollsBackDebitStateAndAudit() {
        var user = fund(100);
        var courier = fund(0);
        var paid = completed(user, reserved(user, 80), courier);
        jdbc.execute("ALTER TABLE credit_accounts ADD CONSTRAINT fail_recipient CHECK(user_id <> '" + courier
                + "'::uuid OR total_balance=0)");
        try {
            assertThatThrownBy(() -> payment.transferReservedCredits(paid)).isInstanceOf(RuntimeException.class);
            assertThat(creditAccountService.getBalance(user)).isEqualTo(new CreditBalanceResponse(20, 80));
            assertThat(creditAccountService.getBalance(courier)).isEqualTo(new CreditBalanceResponse(0, 0));
            assertThat(count("credit_transaction_log")).isEqualTo(1);
            assertThat(results.events).isEmpty();
        } finally {
            jdbc.execute("ALTER TABLE credit_accounts DROP CONSTRAINT fail_recipient");
        }
        payment.transferReservedCredits(paid);
        assertThat(outcome()).isEqualTo("PAID");
    }

    @Test
    void auditFailureRollsBackRefund() {
        var user = fund(100);
        var cancel = cancelled(user, reserved(user, 80));
        jdbc.execute("ALTER TABLE credit_transaction_log ADD CONSTRAINT fail_refund CHECK(transaction_type='RESERVE')");
        try {
            assertThatThrownBy(() -> refund.releaseReservedCredits(cancel)).isInstanceOf(RuntimeException.class);
            assertThat(creditAccountService.getBalance(user)).isEqualTo(new CreditBalanceResponse(20, 80));
            assertThat(count("credit_transaction_log")).isEqualTo(1);
            assertThat(results.events).isEmpty();
        } finally {
            jdbc.execute("ALTER TABLE credit_transaction_log DROP CONSTRAINT fail_refund");
        }
        refund.releaseReservedCredits(cancel);
        assertThat(creditAccountService.getBalance(user)).isEqualTo(new CreditBalanceResponse(100, 0));
    }

    @Test
    void auditFailureRollsBackPaymentBeforePublishingResult() {
        var user = fund(100);
        var courier = fund(0);
        var paid = completed(user, reserved(user, 80), courier);
        jdbc.execute(
                "ALTER TABLE credit_transaction_log ADD CONSTRAINT fail_payment CHECK(transaction_type='RESERVE')");
        try {
            assertThatThrownBy(() -> payment.transferReservedCredits(paid)).isInstanceOf(RuntimeException.class);
            assertThat(creditAccountService.getBalance(user)).isEqualTo(new CreditBalanceResponse(20, 80));
            assertThat(creditAccountService.getBalance(courier)).isEqualTo(new CreditBalanceResponse(0, 0));
            assertThat(count("credit_transaction_log")).isEqualTo(1);
            assertThat(results.events).isEmpty();
        } finally {
            jdbc.execute("ALTER TABLE credit_transaction_log DROP CONSTRAINT fail_payment");
        }
        payment.transferReservedCredits(paid);
        assertThat(outcome()).isEqualTo("PAID");
        assertThat(creditAccountService.getBalance(user)).isEqualTo(new CreditBalanceResponse(20, 0));
        assertThat(creditAccountService.getBalance(courier)).isEqualTo(new CreditBalanceResponse(80, 0));
        assertThat(count("credit_transaction_log")).isEqualTo(2);
    }

    @Test
    void concurrentRefundAndPaymentHaveOneTerminalEffect() throws Exception {
        var user = fund(100);
        var courier = fund(0);
        var r = reserved(user, 80);
        concurrent(
                () -> refund.releaseReservedCredits(cancelled(user, r)),
                () -> payment.transferReservedCredits(completed(user, r, courier)));
        assertThat(results.events.stream().map(e -> e.outcome()).toList()).contains("TERMINAL_CONFLICT");
        assertThat(creditAccountService.getBalance(user).reservedBalance()).isZero();
        assertThat(creditAccountService.getBalance(user).availableBalance()
                        + creditAccountService.getBalance(courier).availableBalance())
                .isEqualTo(100);
        assertThat(count("credit_transaction_log")).isEqualTo(2);
    }

    @Test
    void oppositePaymentsUseConsistentAccountLockOrder() throws Exception {
        var a = fund(100);
        var b = fund(100);
        var r = reserved(a, 80);
        var s = reserved(b, 30);
        concurrent(
                () -> payment.transferReservedCredits(completed(a, r, b)),
                () -> payment.transferReservedCredits(completed(b, s, a)));
        assertThat(creditAccountService.getBalance(a)).isEqualTo(new CreditBalanceResponse(50, 0));
        assertThat(creditAccountService.getBalance(b)).isEqualTo(new CreditBalanceResponse(150, 0));
        assertThat(count("credit_transaction_log")).isEqualTo(4);
    }

    @TestConfiguration
    @EnableConfigurationProperties(CreditProperties.class)
    @EnableTransactionManagement
    @EnableJpaRepositories(basePackageClasses = CreditAccountRepository.class)
    @Import({
        CreditReservationService.class,
        CreditAccountService.class,
        CreditPaymentService.class,
        CreditRefundService.class,
        CreditSettlementSupport.class,
        CreditTransactionLogListener.class,
        CurrentUserService.class,
        AuthenticationContextService.class,
        AuthenticatedUserResolver.class
    })
    static class TestConfig {
        @Bean
        Results results() {
            return new Results();
        }
    }
}
