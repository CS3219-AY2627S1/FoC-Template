package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.mapstruct.factory.Mappers;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.json.JsonMapper;

import sg.edu.nus.foc.common.penalty.PenaltySystemPolicy;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderEventOutbox;
import sg.edu.nus.foc.order.domain.repository.OrderEventOutboxRepository;
import sg.edu.nus.foc.order.messagingpublisher.dto.OrderTaskEvent;
import sg.edu.nus.foc.order.messagingpublisher.dto.PenaltyScoreAdditionEvent;
import sg.edu.nus.foc.order.messagingpublisher.dto.PenaltyScoreDeductionEvent;
import sg.edu.nus.foc.order.messagingpublisher.interfaces.IOpenOrderRefundTaskPublisher;
import sg.edu.nus.foc.order.messagingpublisher.interfaces.IOrderCompletionTaskPublisher;
import sg.edu.nus.foc.order.messagingpublisher.interfaces.IPenaltyScoreAdditionPublisher;
import sg.edu.nus.foc.order.messagingpublisher.interfaces.IPenaltyScoreDeductionPublisher;
import sg.edu.nus.foc.order.messagingpublisher.mapper.OrderTaskEventMapper;

class PenaltyOutboxDispatchTest {

    private static final Instant NOW = Instant.parse("2026-10-14T10:00:00Z");
    private final JsonMapper json = JsonMapper.builder().build();
    private final OrderEventOutboxRepository outbox = mock(OrderEventOutboxRepository.class);
    private final IPenaltyScoreAdditionPublisher addition = mock(IPenaltyScoreAdditionPublisher.class);
    private final IPenaltyScoreDeductionPublisher deduction = mock(IPenaltyScoreDeductionPublisher.class);
    private final OrderOutboxDispatcher dispatcher = new OrderOutboxDispatcher(outbox,
            mock(IOrderCompletionTaskPublisher.class), mock(IOpenOrderRefundTaskPublisher.class), addition, deduction, json);

    @Test
    void routesBothDirectionsWithStoredAmountAndOperationalMetadata() {
        PenaltyScoreAdditionEvent add = (PenaltyScoreAdditionEvent) event(PenaltySystemPolicy.OVERDUE_DELIVERY);
        add.setPenaltyAmount(4); // Stored older policy amount must not be remapped.
        OrderTaskEvent subtract = event(PenaltySystemPolicy.SUCCESSFUL_DELIVERY);
        claim(add);
        claim(subtract);
        dispatcher.dispatch(add.getEventId());
        dispatcher.dispatch(subtract.getEventId());

        ArgumentCaptor<PenaltyScoreAdditionEvent> added = ArgumentCaptor.forClass(PenaltyScoreAdditionEvent.class);
        verify(addition).publishPenaltyScoreAddition(added.capture());
        assertEquals(add.getEventId(), added.getValue().getEventId());
        assertEquals(4, added.getValue().getPenaltyAmount());
        assertEquals(add.getOrderVersion(), added.getValue().getOrderVersion());
        assertEquals(2, added.getValue().getEventVersion());
        assertEquals(1L, added.getValue().getCourierSequence());
        ArgumentCaptor<PenaltyScoreDeductionEvent> deducted = ArgumentCaptor.forClass(PenaltyScoreDeductionEvent.class);
        verify(deduction).publishPenaltyScoreDeduction(deducted.capture());
        assertEquals(1, deducted.getValue().getPenaltyAmount());
        verify(outbox).markPublished(eq(add.getEventId()), any());
        verify(outbox).markPublished(eq(subtract.getEventId()), any());
    }

    @Test
    void failedPenaltyRetriesSamePayloadWhileOtherDuePenaltyProceeds() {
        OrderTaskEvent failed = event(PenaltySystemPolicy.OVERDUE_DELIVERY);
        OrderTaskEvent success = event(PenaltySystemPolicy.SUCCESSFUL_DELIVERY);
        claim(failed);
        claim(success);
        doThrow(new IllegalStateException("Pub/Sub unavailable")).when(addition).publishPenaltyScoreAddition(any());
        ReflectionTestUtils.setField(dispatcher, "batchSize", 20);
        when(outbox.findDueIds(any(), eq(20))).thenReturn(List.of(failed.getEventId(), success.getEventId()));
        dispatcher.dispatchDueBatch();
        dispatcher.dispatch(failed.getEventId());

        ArgumentCaptor<PenaltyScoreAdditionEvent> retries = ArgumentCaptor.forClass(PenaltyScoreAdditionEvent.class);
        verify(addition, times(2)).publishPenaltyScoreAddition(retries.capture());
        assertEquals(retries.getAllValues().get(0).getEventId(), retries.getAllValues().get(1).getEventId());
        assertEquals(json.writeValueAsString(retries.getAllValues().get(0)), json.writeValueAsString(retries.getAllValues().get(1)));
        verify(outbox, times(2)).scheduleRetry(eq(failed.getEventId()), any(), eq("Pub/Sub unavailable"));
        verify(outbox).markPublished(eq(success.getEventId()), any());
    }

    private OrderTaskEvent event(PenaltySystemPolicy reason) {
        Order order = Order.open("requester", "item", "pickup", "delivery", 3, 15, NOW, NOW.plusSeconds(3600));
        return new OrderTaskEventFactory(Mappers.getMapper(OrderTaskEventMapper.class), TestPenaltySequences.store())
                .penalty("command", order, "courier", NOW, reason);
    }

    private void claim(OrderTaskEvent event) {
        OrderEventOutbox entry = OrderEventOutbox.pending(event.getEventId(), event.getOrderId(), event.getEventType(),
                event.getEventVersion(), event.getOrderVersion(), json.writeValueAsString(event), NOW);
        entry.claim(NOW, NOW.plusSeconds(120));
        when(outbox.claim(eq(event.getEventId()), any(), any())).thenReturn(Optional.of(entry));
    }
}
