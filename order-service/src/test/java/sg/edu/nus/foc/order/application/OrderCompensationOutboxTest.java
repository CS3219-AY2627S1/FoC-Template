package sg.edu.nus.foc.order.application;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.test.util.ReflectionTestUtils;
import sg.edu.nus.foc.order.application.recovery.*;
import sg.edu.nus.foc.order.domain.OrderEventOutbox;
import sg.edu.nus.foc.order.domain.repository.OrderEventOutboxRepository;
import sg.edu.nus.foc.order.messagingpublisher.interfaces.*;
import tools.jackson.databind.json.JsonMapper;

class OrderCompensationOutboxTest {
    final OrderEventOutboxRepository repository = mock(OrderEventOutboxRepository.class);
    final CreditCompensationPublisher publisher = mock(CreditCompensationPublisher.class);
    final OrderEventOutbox message = mock(OrderEventOutbox.class);
    @SuppressWarnings("unchecked") final ObjectProvider<CreditCompensationPublisher> provider = mock(ObjectProvider.class);
    final OrderOutboxDispatcher dispatcher = new OrderOutboxDispatcher(repository,
        mock(IOrderCompletionTaskPublisher.class), mock(IOpenOrderRefundTaskPublisher.class),
        mock(IPenaltyScoreAdditionPublisher.class), mock(IPenaltyScoreDeductionPublisher.class), JsonMapper.builder().build());
    OrderCompensationOutboxTest() {
        ReflectionTestUtils.setField(dispatcher, "compensationPublisher", provider);
        when(provider.getObject()).thenReturn(publisher);
        when(repository.claim(eq("C"), any(), any())).thenReturn(Optional.of(message));
        when(message.getEventId()).thenReturn("C");
        when(message.getEventType()).thenReturn("CreditCompensationRequested");
        when(message.getPayload()).thenReturn("{\"eventId\":\"C\",\"commandId\":\"K\",\"operation\":\"CLEAR_COURIER\",\"orderId\":\"O\",\"actorId\":\"courier\",\"generation\":2}");
    }
    @Test void savedRequestIsPublishedBeforeTheOutboxIsMarkedPublished() {
        dispatcher.dispatch("C");
        var ordered = inOrder(publisher, repository);
        ordered.verify(publisher).publish(argThat(q -> "K".equals(q.commandId()) && "CLEAR_COURIER".equals(q.operation()) && q.amount()==null));
        ordered.verify(repository).markPublished(eq("C"), any());
    }
    @Test void missingOrFailedDeliveryNeverMarksTheOutboxPublished() {
        doThrow(new IllegalStateException("fixture transport unavailable")).when(publisher).publish(any());
        dispatcher.dispatch("C");
        verify(repository, never()).markPublished(any(), any());
        verify(repository).scheduleRetry(eq("C"), any(), anyString());
    }
}
