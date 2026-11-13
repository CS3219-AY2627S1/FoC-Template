/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-27
 * Mode: Test generation and verification assistance.
 * Scope: Generated coverage for the Credit compensation workflow and its failure cases.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.credit.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import sg.edu.nus.foc.credit.credit.CreditCommandService;
import sg.edu.nus.foc.credit.credit.CreditOutcomeEvent;
import sg.edu.nus.foc.credit.credit.CreditOutcomeType;
import sg.edu.nus.foc.credit.credit.CreditService;
import sg.edu.nus.foc.credit.error.CreditCommandException;
import sg.edu.nus.foc.credit.error.ErrorCode;
import sg.edu.nus.foc.credit.error.EventConflictException;
import sg.edu.nus.foc.credit.error.ForbiddenException;
import sg.edu.nus.foc.credit.messaging.CreditCompensationOutboxDispatcher;
import sg.edu.nus.foc.credit.messaging.CreditCompensationRequest;
import sg.edu.nus.foc.credit.messaging.CreditCompensationResultPublisher;
import sg.edu.nus.foc.credit.messaging.CreditCompensationService;
import sg.edu.nus.foc.credit.support.PostgreSqlTestContainer;

@SpringBootTest(properties = {
        "CREDIT_RESULT_OUTBOX_RECOVERY_CRON=0 0 0 1 1 *",
        "CREDIT_MESSAGING_MODE=google"
})
@AutoConfigureMockMvc
class CreditCompensationWorkflowIntegrationTest {

    private static final String REQUESTER = "comp-requester";
    private static final String COURIER = "comp-courier";
    private static final Instant OCCURRED_AT = Instant.parse("2026-10-26T00:00:00Z");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        PostgreSqlTestContainer.register(registry);
    }

    @Autowired JdbcTemplate jdbc;
    @Autowired CreditService credit;
    @Autowired CreditCommandService commands;
    @Autowired CreditCompensationStore store;
    @Autowired CreditCompensationService compensationService;
    @Autowired CreditCompensationOutboxDispatcher dispatcher;
    @Autowired CreditCompensationOutboxStore outbox;
    @Autowired MockMvc mvc;

    @MockitoBean CreditCompensationResultPublisher publisher;
    @MockitoSpyBean CreditCompensationResultOutboxJpaRepository outboxRepository;

    @BeforeEach
    void resetState() {
        reset(publisher, outboxRepository);
        jdbc.execute("truncate table credit_compensation_result_outbox, credit_compensation_inbox, "
                + "credit_ledger, credit_reservations, credit_idempotency_records, "
                + "credit_command_records, credit_accounts cascade");
    }

    @Test
    void compensationBeforeExecutionCreatesAnAbsorbingTombstoneAndDetectsReuse() {
        CreditCompensationRequest request = request("11111111-1111-4111-8111-111111111111",
                "fenced-reserve", "RESERVE", "never-applied", REQUESTER, 2, 5L);

        doReturn("published").when(publisher).publish(anyString(), anyInt(), any());
        CreditCompensationStore.Processed first = compensationService.process(request);
        CreditCompensationStore.Processed replay = compensationService.process(request);

        assertThat(first.result().outcome()).isEqualTo("COMPENSATED");
        assertThat(first.result().code()).isEqualTo("FENCED_NO_EFFECT");
        assertThat(replay.replayed()).isTrue();
        assertThat(replay.resultEventId()).isEqualTo(first.resultEventId());
        verify(publisher, times(2)).publish(anyString(), anyInt(), any());
        assertThat(text("select state from credit_compensation_result_outbox where event_id = '"
                + first.resultEventId() + "'")) .isEqualTo("PUBLISHED");
        assertThatThrownBy(() -> commands.reserve(
                "fenced-reserve", 99, "never-applied", REQUESTER, 5))
                .isInstanceOfSatisfying(CreditCommandException.class,
                        error -> assertThat(error.errorCode()).isEqualTo(ErrorCode.COMMAND_COMPENSATED));
        assertThat(count("credit_reservations")).isZero();

        CreditCompensationRequest changed = request(request.eventId(), request.commandId(),
                request.operation(), request.orderId(), request.actorId(), request.generation(), 6L);
        assertThatThrownBy(() -> store.process(changed)).isInstanceOf(EventConflictException.class);
        assertThat(count("credit_compensation_inbox")).isOne();
    }

    @Test
    void reserveReversalIsExactlyOnceAndHistoricalProofIsNeverInvented() {
        register(REQUESTER);
        commands.reserve("reserve-key", 1, "reserve-order", REQUESTER, 8);
        CreditCompensationRequest request = request("22222222-2222-4222-8222-222222222222",
                "reserve-key", "RESERVE", "reserve-order", REQUESTER, 2, 8L);

        assertThat(store.process(request).result().code()).isEqualTo("REVERSED");
        assertThat(store.process(request).replayed()).isTrue();
        assertThat(jdbc.queryForObject("select reserved_balance from credit_accounts where user_id = ?",
                Long.class, REQUESTER)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from credit_ledger "
                + "where origin_type = 'COMMAND_COMPENSATION' and origin_id = 'reserve-key'",
                Long.class)).isOne();

        commands.reserve("historical-key", 1, "historical-order", REQUESTER, 3);
        jdbc.update("update credit_command_records set effect_revision = null where command_id = ?",
                "historical-key");
        CreditCompensationStore.Processed historical = store.process(request(
                "33333333-3333-4333-8333-333333333333", "historical-key", "RESERVE",
                "historical-order", REQUESTER, 2, 3L));
        assertThat(historical.result().outcome()).isEqualTo("RECONCILIATION_REQUIRED");
        assertThat(historical.result().code()).isEqualTo("PREIMAGE_UNAVAILABLE");
    }

    @Test
    void assignmentUsesRevisionForAbaAndClearRestoresItsExactPreimage() {
        register(REQUESTER);
        register(COURIER);
        credit.reserve("clear-order", REQUESTER, 5);
        commands.assignCourier("assign-key", 1, "clear-order", COURIER);
        commands.clearCourier("clear-key", 1, "clear-order", COURIER);

        CreditCompensationStore.Processed restored = store.process(request(
                "44444444-4444-4444-8444-444444444444", "clear-key", "CLEAR_COURIER",
                "clear-order", COURIER, 2, null));
        assertThat(restored.result().code()).isEqualTo("REVERSED");
        assertThat(text("select courier_id from credit_reservations where order_id = 'clear-order'"))
                .isEqualTo(COURIER);
        assertThat(text("select courier_assignment_identity from credit_reservations "
                + "where order_id = 'clear-order'")) .isEqualTo("assign-key");

        commands.clearCourier("clear-again", 1, "clear-order", COURIER);
        commands.assignCourier("assign-new", 1, "clear-order", COURIER);
        CreditCompensationStore.Processed oldAssignment = store.process(request(
                "55555555-5555-4555-8555-555555555555", "assign-key", "ASSIGN_COURIER",
                "clear-order", COURIER, 2, null));
        assertThat(oldAssignment.result().outcome()).isEqualTo("RECONCILIATION_REQUIRED");
        assertThat(oldAssignment.result().code()).isEqualTo("REVISION_CHANGED");
        assertThat(text("select courier_assignment_identity from credit_reservations "
                + "where order_id = 'clear-order'")) .isEqualTo("assign-new");
    }

    @Test
    void settlementRefundAndSelfAssignmentCannotBeUndoneOrBypassSafety() {
        register(REQUESTER);
        register(COURIER);
        commands.reserve("settled-reserve", 1, "settled-order", REQUESTER, 6);
        commands.assignCourier("settled-assign", 1, "settled-order", COURIER);
        credit.processOutcome(new CreditOutcomeEvent("settlement-event", CreditOutcomeType.ORDER_COMPLETION,
                "settled-order", "COMPLETED", 6, OCCURRED_AT, COURIER));
        CreditCompensationStore.Processed settled = store.process(request(
                "66666666-6666-4666-8666-666666666666", "settled-reserve", "RESERVE",
                "settled-order", REQUESTER, 2, 6L));
        assertThat(settled.result().code()).isEqualTo("ALREADY_SETTLED");

        commands.reserve("refunded-reserve", 1, "refunded-order", REQUESTER, 4);
        credit.processOutcome(new CreditOutcomeEvent("refund-event", CreditOutcomeType.OPEN_ORDER_REFUND,
                "refunded-order", "CANCELLED", 4, OCCURRED_AT, null));
        CreditCompensationStore.Processed refunded = store.process(request(
                "77777777-7777-4777-8777-777777777777", "refunded-reserve", "RESERVE",
                "refunded-order", REQUESTER, 2, 4L));
        assertThat(refunded.result().code()).isEqualTo("ALREADY_SETTLED");

        credit.reserve("self-order", REQUESTER, 1);
        assertThatThrownBy(() -> credit.assignCourier("self-order", REQUESTER))
                .isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> commands.assignCourier(
                "self-assignment", 1, "self-order", REQUESTER))
                .isInstanceOf(CreditCommandException.class);
        assertThat(text("select courier_id from credit_reservations where order_id = 'self-order'"))
                .isNull();
    }

    @Test
    void transactionRollbackAndCommitBeforePublishRemainRecoverable() {
        register(REQUESTER);
        commands.reserve("rollback-key", 1, "rollback-order", REQUESTER, 7);
        CreditCompensationRequest request = request("88888888-8888-4888-8888-888888888888",
                "rollback-key", "RESERVE", "rollback-order", REQUESTER, 2, 7L);
        doThrow(new IllegalStateException("outbox write failed"))
                .when(outboxRepository).save(any(CreditCompensationResultOutboxEntity.class));

        assertThatThrownBy(() -> store.process(request)).hasMessageContaining("outbox write failed");
        assertThat(text("select status from credit_reservations where order_id = 'rollback-order'"))
                .isEqualTo("RESERVED");
        assertThat(count("credit_compensation_inbox")).isZero();
        reset(outboxRepository);

        doThrow(new IllegalStateException("broker unavailable"))
                .when(publisher).publish(anyString(), anyInt(), any());
        CreditCompensationStore.Processed committed = compensationService.process(request);
        assertThat(text("select status from credit_reservations where order_id = 'rollback-order'"))
                .isEqualTo("REFUNDED");
        assertThat(text("select state from credit_compensation_result_outbox where event_id = '"
                + committed.resultEventId() + "'")) .isEqualTo("PENDING");

        reset(publisher);
        doReturn("broker-message").when(publisher).publish(anyString(), anyInt(), any());
        // Database-container time and the host publisher clock need not agree.
        // Make this fixture unambiguously due instead of racing the two clocks.
        jdbc.update("update credit_compensation_result_outbox set next_attempt_at = ? "
                + "where event_id = ?", java.sql.Timestamp.from(Instant.EPOCH), committed.resultEventId());
        assertThat(outbox.dueIds(Instant.now(), 50)).contains(committed.resultEventId());
        dispatcher.dispatchDue();
        assertThat(text("select state from credit_compensation_result_outbox where event_id = '"
                + committed.resultEventId() + "'")) .isEqualTo("PUBLISHED");
    }

    @Test
    void failedResultIsRetainedAndAdminRedrivesTheSameEventId() throws Exception {
        register(REQUESTER);
        commands.reserve("failed-key", 1, "failed-order", REQUESTER, 2);
        CreditCompensationStore.Processed processed = store.process(request(
                "99999999-9999-4999-8999-999999999999", "failed-key", "RESERVE",
                "failed-order", REQUESTER, 2, 2L));
        jdbc.update("update credit_compensation_result_outbox set attempt_count = 9 where event_id = ?",
                processed.resultEventId());
        doThrow(new IllegalStateException("still unavailable"))
                .when(publisher).publish(anyString(), anyInt(), any());

        dispatcher.dispatch(processed.resultEventId());
        assertThat(text("select state from credit_compensation_result_outbox where event_id = '"
                + processed.resultEventId() + "'")) .isEqualTo("FAILED");
        assertThat(outbox.failedCount()).isOne();

        reset(publisher);
        doReturn("redriven").when(publisher).publish(anyString(), anyInt(), any());
        mvc.perform(post("/api/credits/admin/compensation-results/{eventId}/redrive",
                        processed.resultEventId()))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/credits/admin/compensation-results/{eventId}/redrive",
                        processed.resultEventId()).with(jwt().jwt(token -> token.subject(REQUESTER))))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/credits/admin/compensation-results/{eventId}/redrive",
                        processed.resultEventId()).with(jwt().jwt(token -> token.subject("admin"))
                        .authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.eventId").value(processed.resultEventId()))
                .andExpect(jsonPath("$.status").value("PENDING"));
        assertThat(text("select state from credit_compensation_result_outbox where event_id = '"
                + processed.resultEventId() + "'")) .isEqualTo("PUBLISHED");
        verify(publisher, times(1)).publish(anyString(), anyInt(), any());
    }

    private void register(String userId) {
        credit.initializeAccount(UUID.randomUUID(), userId, OCCURRED_AT);
    }

    private static CreditCompensationRequest request(String eventId, String commandId,
                                                     String operation, String orderId,
                                                     String actorId, long generation, Long amount) {
        return new CreditCompensationRequest(eventId, commandId, operation, orderId,
                actorId, generation, amount);
    }

    private long count(String table) {
        return jdbc.queryForObject("select count(*) from " + table, Long.class);
    }

    private String text(String sql) {
        return jdbc.queryForObject(sql, String.class);
    }
}
