package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import sg.edu.nus.foc.order.application.recovery.*;
import sg.edu.nus.foc.order.domain.OrderProblem;
import tools.jackson.databind.json.JsonMapper;

/** SQL collaborator fixtures; real PostgreSQL races are tested separately. */
class OrderCompensationJournalTest {
    final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    final OrderCommandStore commands = mock(OrderCommandStore.class);
    final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    final OrderCompensationJournal journal = new OrderCompensationJournal(jdbc, JsonMapper.builder().build(), commands, events);
    final Map<String,Object> row = new HashMap<>();
    final String compensation = UUID.randomUUID().toString();
    final OrderCommandStore.Entry claim = new OrderCommandStore.Entry("K", "courier", "ACCEPT", "O",
        new CommandRequest("ACCEPT", "courier", "O", 0, null), "hash", "PENDING", null, "PROCESSING", "pending",
        1, 1, "worker", Instant.now().plusSeconds(120), Instant.now(), false, null, null, Instant.now());
    @BeforeEach void rows() {
        row.put("command_id", "K"); row.put("status", "PENDING"); row.put("owner", "worker");
        row.put("generation", 1L); row.put("credit_step_status", "PENDING"); row.put("final_stage_status", "PENDING");
        row.put("possible_effect", true); row.put("compensation_generation", 2L);
        when(jdbc.queryForList(contains("for update nowait"), eq("K"))).thenReturn(List.of(row));
        when(commands.get("K")).thenReturn(claim);
    }
    @Test void committedSuccessAfterLostCommitAcknowledgmentIsNeverCompensated() {
        row.put("status", "COMPLETED"); row.put("final_stage_status", "SUCCESS");
        journal.abandon(claim, "UNKNOWN_COMMIT");
        verify(jdbc, never()).update(anyString(), any(Object[].class));
        verifyNoInteractions(events);
    }
    @Test void staleWorkerCannotCompensateAfterAnewOwnerTakesOver() {
        row.put("generation", 2L); row.put("owner", "new-worker");
        journal.abandon(claim, "TIMEOUT");
        verify(jdbc, never()).update(anyString(), any(Object[].class));
        verifyNoInteractions(events);
    }
    @Test void uncertaintyCreatesADurableMinimalRequestRatherThanAnHttpReversal() {
        journal.abandon(claim, "TIMEOUT");
        verify(jdbc).update(contains("insert into order_event_outbox"), anyString(), eq("K"), argThat((String s) ->
            s.contains("ASSIGN_COURIER") && s.contains("\"commandId\":\"K\"") && !s.contains("amount") && !s.contains("token")));
        verify(events).publishEvent(any(OrderOutboxDispatchRequested.class));
    }
    @Test void definitelyUnsentWorkClosesWithoutPublishingACompensation() {
        row.put("possible_effect", false);
        journal.abandon(claim, "FORBIDDEN");
        verify(jdbc).update(contains("final_stage_status='FULLY_COMPENSATED'"), eq("FAILED"), eq("FORBIDDEN"), anyString(), eq("K"));
        verifyNoInteractions(events);
    }

    @Test void definitelyUnsentBusinessRejectionPreservesTheActionableMessage() {
        row.put("possible_effect", false);
        String message = "This order has an active report. It must be resolved before you can cancel or abort the order.";
        journal.abandon(claim, "ORDER_ON_HOLD", message);
        verify(jdbc).update(contains("final_stage_status='FULLY_COMPENSATED'"), eq("FAILED"),
                eq("ORDER_ON_HOLD"), eq(message), eq("K"));
        verifyNoInteractions(events);
    }

    @Test void aBusinessErrorAfterPossibleCreditEffectStillRequiresCompensation() {
        journal.abandon(claim, "ORDER_ON_HOLD", "Resolve the report first.");
        verify(jdbc).update(contains("insert into order_event_outbox"), anyString(), eq("K"), anyString());
        verify(events).publishEvent(any(OrderOutboxDispatchRequested.class));
    }
    @Test void finalizationCannotProceedWhenCreditSuccessIsNotConfirmed() {
        assertThrows(OrderProblem.class, () -> journal.localSucceeded(claim));
        row.put("credit_step_status", "SUCCESS"); row.put("compensation_id", compensation);
        assertThrows(OrderProblem.class, () -> journal.localSucceeded(claim));
    }
    CreditCompensationResult result(String order, String operation, long generation) {
        return new CreditCompensationResult(UUID.randomUUID().toString(), compensation, "K", operation, order, generation, "COMPENSATED", "REVERSED");
    }
    @Test void foreignOrderOperationOrGenerationNeverCompletesTheCommand() {
        row.put("compensation_id", compensation);
        for (var result : List.of(result("other", "ASSIGN_COURIER", 2), result("O", "RESERVE", 2), result("O", "ASSIGN_COURIER", 1))) {
            assertThrows(OrderProblem.class, () -> journal.accept(result));
        }
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }
    @Test void invalidOrNullResultFieldsAreRejectedAsValidationErrors() {
        assertThrows(OrderProblem.class, () -> journal.accept(null));
        var invalid = new CreditCompensationResult(UUID.randomUUID().toString(), compensation, "K", null, "O", 2, "COMPENSATED", "REVERSED");
        assertEquals("VALIDATION_ERROR", assertThrows(OrderProblem.class, () -> journal.accept(invalid)).getCode());
    }
    @Test void resultEventIdCannotBeReusedWithDifferentContents() {
        row.put("compensation_id", compensation);
        var result = result("O", "ASSIGN_COURIER", 2);
        when(jdbc.queryForList(contains("select payload_hash"), eq(String.class), eq(result.eventId()))).thenReturn(List.of("different"));
        assertThrows(OrderProblem.class, () -> journal.accept(result));
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test void alreadyCompensatedCommandDoesNotFinalizeAgainForANewResultEventId() {
        row.put("compensation_id", compensation);
        row.put("status", "COMPLETED"); row.put("final_stage_status", "FULLY_COMPENSATED");
        row.put("credit_step_status", "COMPENSATED");
        journal.accept(result("O", "ASSIGN_COURIER", 2));
        verify(jdbc).update(contains("insert into order_compensation_result_inbox"), anyString(), eq(compensation), eq("K"), anyString());
        verify(jdbc, never()).update(contains("final_stage_status='FULLY_COMPENSATED'"), any(), any(), any(), any());
    }
}
