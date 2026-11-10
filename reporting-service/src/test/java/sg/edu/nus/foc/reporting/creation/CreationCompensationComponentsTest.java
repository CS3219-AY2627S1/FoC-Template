/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex, date: 2026-11-10
 * Mode: Test generation and verification.
 * Scope: Added branch coverage for report-creation compensation dispatch and push validation.
 * Author review: User reviewed.
 */
package sg.edu.nus.foc.reporting.creation;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import sg.edu.nus.foc.reporting.error.BadRequestException;
import sg.edu.nus.foc.reporting.error.ConflictException;
import sg.edu.nus.foc.reporting.report.ReportCreationCoordinator;
import sg.edu.nus.foc.reporting.report.ReportSubmissionStore;
import tools.jackson.databind.json.JsonMapper;

class CreationCompensationComponentsTest {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String PAYLOAD = "{\"eventId\":\"11111111-1111-1111-1111-111111111111\","
            + "\"submissionId\":\"22222222-2222-2222-2222-222222222222\","
            + "\"reportId\":\"report\",\"orderId\":\"order\",\"reporterId\":\"user\",\"generation\":2}";

    @AfterEach
    void clearInterruptedFlag() { Thread.interrupted(); }

    @Test
    void dispatcherSkipsDisabledOrUnclaimedWorkAndCompletesPublishedClaims() {
        var store = mock(ReportSubmissionStore.class);
        var coordinator = mock(ReportCreationCoordinator.class);
        var disabled = new RecordingDispatcher(store, coordinator, settings(false), JSON);
        disabled.recover();
        disabled.dispatch("id");
        verifyNoInteractions(store, coordinator);

        var enabled = new RecordingDispatcher(store, coordinator, settings(true), JSON);
        when(store.dueOutbox()).thenReturn(List.of("missing", "ready"));
        var claim = new ReportSubmissionStore.Claim("ready", "owner", PAYLOAD, 1);
        when(store.claim("ready")).thenReturn(Optional.of(claim));
        when(store.claim("missing")).thenReturn(Optional.empty());
        enabled.recover();

        verify(coordinator).recoverExpired();
        verify(store).finish(claim, true);
        assertEquals(List.of("11111111-1111-1111-1111-111111111111"), enabled.published);
    }

    @Test
    void dispatcherRetriesMalformedFailedAndInterruptedPublishing() {
        var store = mock(ReportSubmissionStore.class);
        var coordinator = mock(ReportCreationCoordinator.class);
        var invalid = new ReportSubmissionStore.Claim("invalid", "owner", "not-json", 1);
        when(store.claim("invalid")).thenReturn(Optional.of(invalid));
        new RecordingDispatcher(store, coordinator, settings(true), JSON).dispatch("invalid");
        verify(store).finish(invalid, false);

        reset(store);
        var failed = new ReportSubmissionStore.Claim("failed", "owner", PAYLOAD, 2);
        when(store.claim("failed")).thenReturn(Optional.of(failed));
        var failureDispatcher = new RecordingDispatcher(store, coordinator, settings(true), JSON);
        failureDispatcher.failure = new IllegalStateException("publisher down");
        failureDispatcher.dispatch("failed");
        verify(store).finish(failed, false);
        assertFalse(Thread.currentThread().isInterrupted());

        reset(store);
        var interrupted = new ReportSubmissionStore.Claim("interrupted", "owner", PAYLOAD, 3);
        when(store.claim("interrupted")).thenReturn(Optional.of(interrupted));
        var interruptedDispatcher = new RecordingDispatcher(store, coordinator, settings(true), JSON);
        interruptedDispatcher.failure = new InterruptedException("stop");
        interruptedDispatcher.dispatch("interrupted");
        verify(store).finish(interrupted, false);
        assertTrue(Thread.currentThread().isInterrupted());
    }

    @Test
    void resultControllerAcceptsBoundResultsAndRejectsEveryEnvelopeBoundary() throws Exception {
        var coordinator = mock(ReportCreationCoordinator.class);
        var controller = new CreationCompensationResultController(coordinator, settings(true), JSON);
        var result = new CreationCompensationMessages.Result("event", "compensation", "submission", "report",
                "order", "reporter", 2, "RELEASED");
        String data = Base64.getEncoder().encodeToString(JSON.writeValueAsBytes(result));
        Map<String, String> attributes = Map.of("eventType", "ReportCreationCompensationResult",
                "eventVersion", "1", "eventId", "event");
        var valid = new CreationCompensationResultController.Envelope("result",
                new CreationCompensationResultController.Message(data, attributes));
        assertEquals(204, controller.receive(valid).getStatusCode().value());
        verify(coordinator).acceptCompensation(result);

        var disabled = new CreationCompensationResultController(coordinator, settings(false), JSON);
        List<CreationCompensationResultController.Envelope> invalid = List.of(
                valid,
                new CreationCompensationResultController.Envelope("wrong", valid.message()),
                new CreationCompensationResultController.Envelope("result", null),
                new CreationCompensationResultController.Envelope("result",
                        new CreationCompensationResultController.Message(data, null)),
                envelope(data, Map.of("eventType", "wrong", "eventVersion", "1", "eventId", "event")),
                envelope(data, Map.of("eventType", "ReportCreationCompensationResult", "eventVersion", "2", "eventId", "event")),
                envelope("%%%", attributes),
                envelope(Base64.getEncoder().encodeToString(new byte[16_385]), attributes),
                envelope(Base64.getEncoder().encodeToString("bad-json".getBytes(StandardCharsets.UTF_8)), attributes),
                envelope(data, Map.of("eventType", "ReportCreationCompensationResult", "eventVersion", "1", "eventId", "other")));
        assertThrows(BadRequestException.class, () -> disabled.receive(invalid.getFirst()));
        assertThrows(BadRequestException.class, () -> controller.receive(null));
        for (int i = 1; i < invalid.size(); i++) {
            var envelope = invalid.get(i);
            assertThrows(BadRequestException.class, () -> controller.receive(envelope));
        }

        doThrow(new BadRequestException("bad result", null)).when(coordinator).acceptCompensation(result);
        assertThrows(BadRequestException.class, () -> controller.receive(valid));
        doThrow(new ConflictException("binding conflict")).when(coordinator).acceptCompensation(result);
        assertThrows(ConflictException.class, () -> controller.receive(valid));
    }

    private static CreationCompensationResultController.Envelope envelope(String data, Map<String, String> attributes) {
        return new CreationCompensationResultController.Envelope("result",
                new CreationCompensationResultController.Message(data, attributes));
    }

    private static CreationSettings settings(boolean enabled) {
        return new CreationSettings(enabled, "demo-foc", "request", "result", "", "", "", "", false);
    }

    private static final class RecordingDispatcher extends CreationCompensationDispatcher {
        final java.util.ArrayList<String> published = new java.util.ArrayList<>();
        Exception failure;

        RecordingDispatcher(ReportSubmissionStore store, ReportCreationCoordinator coordinator,
                CreationSettings settings, JsonMapper json) {
            super(store, coordinator, settings, json);
        }

        @Override
        protected void publish(CreationCompensationMessages.Request event, String payload) throws Exception {
            if (failure != null) throw failure;
            published.add(event.eventId());
        }
    }
}
