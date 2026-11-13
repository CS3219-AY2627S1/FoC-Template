package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import tools.jackson.databind.json.JsonMapper;
import sg.edu.nus.foc.order.domain.OrderEventOutbox;
import sg.edu.nus.foc.order.domain.OutboxState;
import sg.edu.nus.foc.order.domain.repository.OrderEventOutboxRepository;
import sg.edu.nus.foc.order.messagingpublisher.dto.OrderCompletionTaskEvent;
import sg.edu.nus.foc.order.messagingpublisher.dto.OrderTaskEvent;
import sg.edu.nus.foc.order.messagingpublisher.dto.OpenOrderRefundTaskEvent;
import sg.edu.nus.foc.order.messagingpublisher.interfaces.IOrderCompletionTaskPublisher;
import sg.edu.nus.foc.order.messagingpublisher.interfaces.IOpenOrderRefundTaskPublisher;

class OrderOutboxDispatcherTest {
    private static final Instant CREATED_AT = Instant.parse("2026-10-01T10:00:00Z");

    @Test
    void retiredAcceptedCancellationIsNotPublished() {
        OrderEventOutboxRepository repository = mock(OrderEventOutboxRepository.class);
        IOrderCompletionTaskPublisher completion = mock(IOrderCompletionTaskPublisher.class);
        OrderEventOutbox retired = OrderEventOutbox.pending("retired", "order-1",
                "AcceptedOrderCancellationTaskEvent", 1, 1, "{}", CREATED_AT);
        retired.claim(CREATED_AT, CREATED_AT.plusSeconds(30));
        when(repository.claim(eq("retired"), any(), any())).thenReturn(Optional.of(retired));

        dispatcher(repository, completion).dispatch("retired");

        verify(repository, never()).markPublished(eq("retired"), any());
        verify(repository).scheduleRetry(eq("retired"), any(),
                eq("Unsupported Order event type: AcceptedOrderCancellationTaskEvent"));
        verify(completion, never()).publishOrderCompletionTask(any());
    }

    @Test
    void dispatchesClaimedCompletionAndMarksItPublished() {
        OrderEventOutboxRepository repository = mock(OrderEventOutboxRepository.class);
        IOrderCompletionTaskPublisher completion = mock(IOrderCompletionTaskPublisher.class);
        OrderCompletionTaskEvent event = completionEvent();
        OrderEventOutbox message = claimed(event.getEventId(), event.getEventType(), event);
        when(repository.claim(eq(event.getEventId()), any(Instant.class), any(Instant.class)))
                .thenReturn(Optional.of(message));
        OrderOutboxDispatcher dispatcher = dispatcher(repository, completion);

        dispatcher.dispatch(event.getEventId());

        ArgumentCaptor<OrderCompletionTaskEvent> published = ArgumentCaptor.forClass(OrderCompletionTaskEvent.class);
        verify(completion).publishOrderCompletionTask(published.capture());
        assertEquals(event.getEventId(), published.getValue().getEventId());
        assertEquals(2, published.getValue().getEventVersion());
        assertEquals(2, published.getValue().getOrderVersion());
        verify(repository).markPublished(eq(event.getEventId()), any(Instant.class));
        verify(repository, never()).scheduleRetry(any(), any(), any());
    }

    @Test
    void publisherFailureSchedulesRetryAndDoesNotEscapeDispatcher() {
        OrderEventOutboxRepository repository = mock(OrderEventOutboxRepository.class);
        IOrderCompletionTaskPublisher completion = mock(IOrderCompletionTaskPublisher.class);
        OrderCompletionTaskEvent event = completionEvent();
        OrderEventOutbox message = claimed(event.getEventId(), event.getEventType(), event);
        when(repository.claim(eq(event.getEventId()), any(Instant.class), any(Instant.class)))
                .thenReturn(Optional.of(message));
        doThrow(new IllegalStateException("Pub/Sub unavailable"))
                .when(completion).publishOrderCompletionTask(any(OrderCompletionTaskEvent.class));

        dispatcher(repository, completion).dispatch(event.getEventId());

        ArgumentCaptor<Instant> retryAt = ArgumentCaptor.forClass(Instant.class);
        ArgumentCaptor<String> error = ArgumentCaptor.forClass(String.class);
        verify(repository).scheduleRetry(eq(event.getEventId()), retryAt.capture(), error.capture());
        assertTrue(retryAt.getValue().isAfter(Instant.now()));
        assertTrue(retryAt.getValue().isBefore(Instant.now().plusSeconds(300)));
        assertEquals("Pub/Sub unavailable", error.getValue());
        verify(repository, never()).markPublished(any(), any());
    }

    @Test
    void dispatchDoesNothingWhenAnotherWorkerOwnsTheLease() {
        OrderEventOutboxRepository repository = mock(OrderEventOutboxRepository.class);
        String eventId = "event-locked";
        when(repository.claim(eq(eventId), any(Instant.class), any(Instant.class))).thenReturn(Optional.empty());

        dispatcher(repository, mock(IOrderCompletionTaskPublisher.class)).dispatch(eventId);

        verify(repository, never()).markPublished(any(), any());
        verify(repository, never()).scheduleRetry(any(), any(), any());
    }

    @Test
    void dispatchesOpenRefundThroughItsTypedPublisher() {
        OrderEventOutboxRepository repository = mock(OrderEventOutboxRepository.class);
        IOpenOrderRefundTaskPublisher publisher = mock(IOpenOrderRefundTaskPublisher.class);
        OpenOrderRefundTaskEvent event = new OpenOrderRefundTaskEvent();
        event.setEventId("cancel-event-1");
        event.setEventType("OpenOrderRefundTaskEvent");
        event.setOrderId("order-1");
        event.setOccurredAt(CREATED_AT);
        OrderEventOutbox message = claimed(event.getEventId(), event.getEventType(), event);
        when(repository.claim(eq(event.getEventId()), any(Instant.class), any(Instant.class)))
                .thenReturn(Optional.of(message));

        dispatcher(repository, mock(IOrderCompletionTaskPublisher.class), publisher)
                .dispatch(event.getEventId());

        verify(publisher).publishOpenOrderRefundTask(any(OpenOrderRefundTaskEvent.class));
        verify(repository).markPublished(eq(event.getEventId()), any(Instant.class));
    }

    @Test
    void routesPendingLegacyExpirationOutboxEventToTheOpenRefundTopic() {
        OrderEventOutboxRepository repository = mock(OrderEventOutboxRepository.class);
        IOpenOrderRefundTaskPublisher publisher = mock(IOpenOrderRefundTaskPublisher.class);
        String payload = """
                {"eventId":"expiry-event-1","eventType":"OrderExpirationTaskEvent","eventVersion":1,
                 "orderId":"order-expired","orderVersion":2,"occurredAt":"2026-10-01T10:00:00Z",
                 "actorId":"lifecycle","order":{"id":"order-expired","status":"EXPIRED",
                 "offeredCredits":4,"deliveryTimeLimitMinutes":20,"version":2}}
                """;
        OrderEventOutbox message = OrderEventOutbox.pending(
                "expiry-event-1", "order-expired", "OrderExpirationTaskEvent", 1, 2, payload, CREATED_AT);
        message.claim(CREATED_AT, CREATED_AT.plusSeconds(30));
        when(repository.claim(eq("expiry-event-1"), any(Instant.class), any(Instant.class)))
                .thenReturn(Optional.of(message));

        dispatcher(repository, mock(IOrderCompletionTaskPublisher.class), publisher).dispatch("expiry-event-1");

        ArgumentCaptor<OpenOrderRefundTaskEvent> captured = ArgumentCaptor.forClass(OpenOrderRefundTaskEvent.class);
        verify(publisher).publishOpenOrderRefundTask(captured.capture());
        assertEquals("expiry-event-1", captured.getValue().getEventId());
        assertEquals("OpenOrderRefundTaskEvent", captured.getValue().getEventType());
        tools.jackson.databind.JsonNode json = JsonMapper.builder().build().valueToTree(captured.getValue());
        assertEquals(7, json.size());
        assertEquals(4, json.path("creditAmount").asInt());
        assertEquals("EXPIRED", json.path("orderStatus").asString());
        assertTrue(json.path("courierId").isNull());
        assertEquals(2, captured.getValue().getEventVersion());
        assertEquals(2, captured.getValue().getOrderVersion());
        verify(repository).markPublished(eq("expiry-event-1"), any(Instant.class));
    }

    @Test
    void routesPendingLegacyCancellationOutboxEventToTheOpenRefundTopic() {
        OrderEventOutboxRepository repository = mock(OrderEventOutboxRepository.class);
        IOpenOrderRefundTaskPublisher publisher = mock(IOpenOrderRefundTaskPublisher.class);
        String payload = """
                {"eventId":"cancel-event-legacy","eventType":"OpenOrderCancellationTaskEvent","eventVersion":1,
                 "orderId":"order-cancelled","orderVersion":2,"occurredAt":"2026-10-01T10:00:00Z",
                 "actorId":"requester-1","order":{"id":"order-cancelled","status":"CANCELLED",
                 "offeredCredits":4,"deliveryTimeLimitMinutes":20,"version":2}}
                """;
        OrderEventOutbox message = OrderEventOutbox.pending(
                "cancel-event-legacy", "order-cancelled", "OpenOrderCancellationTaskEvent", 1, 2, payload, CREATED_AT);
        message.claim(CREATED_AT, CREATED_AT.plusSeconds(30));
        when(repository.claim(eq("cancel-event-legacy"), any(Instant.class), any(Instant.class)))
                .thenReturn(Optional.of(message));

        dispatcher(repository, mock(IOrderCompletionTaskPublisher.class), publisher)
                .dispatch("cancel-event-legacy");

        ArgumentCaptor<OpenOrderRefundTaskEvent> captured = ArgumentCaptor.forClass(OpenOrderRefundTaskEvent.class);
        verify(publisher).publishOpenOrderRefundTask(captured.capture());
        assertEquals("cancel-event-legacy", captured.getValue().getEventId());
        assertEquals("OpenOrderRefundTaskEvent", captured.getValue().getEventType());
        tools.jackson.databind.JsonNode json = JsonMapper.builder().build().valueToTree(captured.getValue());
        assertEquals(7, json.size());
        assertEquals(4, json.path("creditAmount").asInt());
        assertEquals("CANCELLED", json.path("orderStatus").asString());
        assertTrue(json.path("courierId").isNull());
        assertEquals(2, captured.getValue().getEventVersion());
        assertEquals(2, captured.getValue().getOrderVersion());
        verify(repository).markPublished(eq("cancel-event-legacy"), any(Instant.class));
    }

    @Test
    void convertsPendingSnapshotCompletionWithoutChangingIdentityOrFacts() {
        OrderEventOutboxRepository repository = mock(OrderEventOutboxRepository.class);
        IOrderCompletionTaskPublisher publisher = mock(IOrderCompletionTaskPublisher.class);
        String payload = """
                {"eventId":"legacy-completion","eventType":"OrderCompletionTaskEvent","eventVersion":1,
                 "orderId":"order-completed","orderVersion":7,"occurredAt":"2026-10-01T10:00:00Z",
                 "actorId":"requester","overdue":true,"overdueAt":"2026-10-01T09:00:00Z",
                 "order":{"id":"order-completed","courierId":"saved-courier","status":"COMPLETED",
                 "offeredCredits":9,"version":7}}
                """;
        OrderEventOutbox message = OrderEventOutbox.pending(
                "legacy-completion", "order-completed", "OrderCompletionTaskEvent", 1, 7, payload, CREATED_AT);
        message.claim(CREATED_AT, CREATED_AT.plusSeconds(30));
        when(repository.claim(eq("legacy-completion"), any(Instant.class), any(Instant.class)))
                .thenReturn(Optional.of(message));

        dispatcher(repository, publisher).dispatch("legacy-completion");

        ArgumentCaptor<OrderCompletionTaskEvent> captured = ArgumentCaptor.forClass(OrderCompletionTaskEvent.class);
        verify(publisher).publishOrderCompletionTask(captured.capture());
        tools.jackson.databind.JsonNode json = JsonMapper.builder().build().valueToTree(captured.getValue());
        assertEquals(7, json.size());
        assertEquals("legacy-completion", captured.getValue().getEventId());
        assertEquals(CREATED_AT, captured.getValue().getOccurredAt());
        assertEquals("COMPLETED", json.path("orderStatus").asString());
        assertEquals("saved-courier", json.path("courierId").asString());
        assertEquals(9, json.path("creditAmount").asInt());
        assertEquals(2, captured.getValue().getEventVersion());
        assertEquals(7, captured.getValue().getOrderVersion());
        verify(repository).markPublished(eq("legacy-completion"), any(Instant.class));
    }

    @Test
    void invalidSavedLegacySnapshotIsRetriedRatherThanAcknowledged() {
        OrderEventOutboxRepository repository = mock(OrderEventOutboxRepository.class);
        IOrderCompletionTaskPublisher publisher = mock(IOrderCompletionTaskPublisher.class);
        String payload = """
                {"eventId":"invalid","eventType":"OrderCompletionTaskEvent",
                 "orderId":"order","order":{"status":"COMPLETED"}}
                """;
        OrderEventOutbox message = OrderEventOutbox.pending(
                "invalid", "order", "OrderCompletionTaskEvent", 1, 7, payload, CREATED_AT);
        message.claim(CREATED_AT, CREATED_AT.plusSeconds(30));
        when(repository.claim(eq("invalid"), any(Instant.class), any(Instant.class)))
                .thenReturn(Optional.of(message));

        dispatcher(repository, publisher).dispatch("invalid");

        verify(publisher, never()).publishOrderCompletionTask(any());
        verify(repository, never()).markPublished(any(), any());
        verify(repository).scheduleRetry(eq("invalid"), any(), any());
    }

    @Test
    void retryPersistenceFailureDoesNotSkipTheNextDueEvent() {
        OrderEventOutboxRepository repository = mock(OrderEventOutboxRepository.class);
        IOrderCompletionTaskPublisher completion = mock(IOrderCompletionTaskPublisher.class);
        OrderCompletionTaskEvent failedEvent = completionEvent();
        OrderCompletionTaskEvent successfulEvent = completionEvent();
        successfulEvent.setEventId("event-successful");
        when(repository.findDueIds(any(Instant.class), eq(0)))
                .thenReturn(List.of(failedEvent.getEventId(), successfulEvent.getEventId()));
        when(repository.claim(eq(failedEvent.getEventId()), any(Instant.class), any(Instant.class)))
                .thenReturn(Optional.of(claimed(failedEvent.getEventId(), failedEvent.getEventType(), failedEvent)));
        when(repository.claim(eq(successfulEvent.getEventId()), any(Instant.class), any(Instant.class)))
                .thenReturn(Optional.of(claimed(successfulEvent.getEventId(), successfulEvent.getEventType(), successfulEvent)));
        doThrow(new IllegalStateException("publisher unavailable")).when(completion)
                .publishOrderCompletionTask(org.mockito.ArgumentMatchers.argThat(
                        event -> event.getEventId().equals(failedEvent.getEventId())));
        doThrow(new IllegalStateException("retry database unavailable")).when(repository)
                .scheduleRetry(eq(failedEvent.getEventId()), any(Instant.class), any());

        assertDoesNotThrow(() -> dispatcher(repository, completion).dispatchDueBatch());

        verify(repository).markPublished(eq(successfulEvent.getEventId()), any(Instant.class));
        verify(repository, never()).markPublished(eq(failedEvent.getEventId()), any(Instant.class));
    }

    @Test
    void failedClaimDoesNotSkipALaterDueEvent() {
        OrderEventOutboxRepository repository = mock(OrderEventOutboxRepository.class);
        IOrderCompletionTaskPublisher completion = mock(IOrderCompletionTaskPublisher.class);
        OrderCompletionTaskEvent successfulEvent = completionEvent();
        when(repository.findDueIds(any(Instant.class), eq(0)))
                .thenReturn(List.of("claim-failed", successfulEvent.getEventId()));
        when(repository.claim(eq("claim-failed"), any(Instant.class), any(Instant.class)))
                .thenThrow(new IllegalStateException("claim commit failed"));
        when(repository.claim(eq(successfulEvent.getEventId()), any(Instant.class), any(Instant.class)))
                .thenReturn(Optional.of(claimed(successfulEvent.getEventId(), successfulEvent.getEventType(), successfulEvent)));

        assertDoesNotThrow(() -> dispatcher(repository, completion).dispatchDueBatch());

        verify(repository).markPublished(eq(successfulEvent.getEventId()), any(Instant.class));
        verify(repository, never()).claimDue(any(), any(), org.mockito.ArgumentMatchers.anyInt());
    }

    @Test
    void failedPublishedMarkerRetriesItsEventAndContinues() {
        OrderEventOutboxRepository repository = mock(OrderEventOutboxRepository.class);
        IOrderCompletionTaskPublisher completion = mock(IOrderCompletionTaskPublisher.class);
        OrderCompletionTaskEvent firstEvent = completionEvent();
        OrderCompletionTaskEvent nextEvent = completionEvent();
        nextEvent.setEventId("next-event");
        when(repository.findDueIds(any(Instant.class), eq(0)))
                .thenReturn(List.of(firstEvent.getEventId(), nextEvent.getEventId()));
        when(repository.claim(eq(firstEvent.getEventId()), any(Instant.class), any(Instant.class)))
                .thenReturn(Optional.of(claimed(firstEvent.getEventId(), firstEvent.getEventType(), firstEvent)));
        when(repository.claim(eq(nextEvent.getEventId()), any(Instant.class), any(Instant.class)))
                .thenReturn(Optional.of(claimed(nextEvent.getEventId(), nextEvent.getEventType(), nextEvent)));
        doThrow(new IllegalStateException("published marker commit failed"))
                .when(repository).markPublished(eq(firstEvent.getEventId()), any());

        assertDoesNotThrow(() -> dispatcher(repository, completion).dispatchDueBatch());

        verify(repository).scheduleRetry(eq(firstEvent.getEventId()), any(), any());
        verify(repository).markPublished(eq(nextEvent.getEventId()), any());
    }

    @Test
    void emptyDueSelectionDoesNotClaimOrPublishAnything() {
        OrderEventOutboxRepository repository = mock(OrderEventOutboxRepository.class);
        IOrderCompletionTaskPublisher completion = mock(IOrderCompletionTaskPublisher.class);
        when(repository.findDueIds(any(), eq(0))).thenReturn(List.of());

        dispatcher(repository, completion).dispatchDueBatch();

        verify(repository, never()).claim(any(), any(), any());
        verify(completion, never()).publishOrderCompletionTask(any());
    }

    private OrderOutboxDispatcher dispatcher(
            OrderEventOutboxRepository repository,
            IOrderCompletionTaskPublisher completion) {
        return dispatcher(repository, completion, mock(IOpenOrderRefundTaskPublisher.class));
    }

    private OrderOutboxDispatcher dispatcher(
            OrderEventOutboxRepository repository,
            IOrderCompletionTaskPublisher completion,
            IOpenOrderRefundTaskPublisher openRefund) {
        return new OrderOutboxDispatcher(
                repository,
                completion,
                openRefund,
                mock(sg.edu.nus.foc.order.messagingpublisher.interfaces.IPenaltyScoreAdditionPublisher.class),
                mock(sg.edu.nus.foc.order.messagingpublisher.interfaces.IPenaltyScoreDeductionPublisher.class),
                JsonMapper.builder().build());
    }

    private OrderEventOutbox claimed(String eventId, String eventType, Object event) {
        JsonMapper mapper = JsonMapper.builder().build();
        OrderTaskEvent taskEvent = (OrderTaskEvent) event;
        OrderEventOutbox outbox = OrderEventOutbox.pending(
                eventId,
                taskEvent.getOrderId(),
                eventType,
                taskEvent.getEventVersion(),
                taskEvent.getOrderVersion(),
                mapper.writeValueAsString(event),
                CREATED_AT);
        outbox.claim(CREATED_AT, CREATED_AT.plusSeconds(30));
        assertEquals(OutboxState.IN_PROGRESS, outbox.getState());
        return outbox;
    }

    private OrderCompletionTaskEvent completionEvent() {
        OrderCompletionTaskEvent event = new OrderCompletionTaskEvent();
        event.setEventId("event-1");
        event.setEventType("OrderCompletionTaskEvent");
        event.setEventVersion(1);
        event.setOrderId("order-1");
        event.setOrderVersion(2);
        event.setOccurredAt(CREATED_AT);
        return event;
    }
}
