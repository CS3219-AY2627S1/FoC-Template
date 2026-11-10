package sg.edu.nus.foc.user.event;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import sg.edu.nus.foc.user.config.UserPushProperties;
import sg.edu.nus.foc.user.dto.*;
import sg.edu.nus.foc.user.logic.UserService;
import tools.jackson.databind.json.JsonMapper;

class SequencedPenaltyConsumerTest {
    final JsonMapper json = JsonMapper.builder().build();
    final SequencedPenaltyProcessor processor = mock(SequencedPenaltyProcessor.class);
    final PenaltyEventProcessingService legacy = mock(PenaltyEventProcessingService.class);
    final UserPushProperties push = new UserPushProperties("demo-foc-local", null, null, null, null, "unified");
    final PenaltyEventConsumer consumer = new PenaltyEventConsumer(json, mock(UserService.class),
            legacy, processor, push);

    PenaltyScoreEvent event(String type, String reason, int amount, Long sequence) {
        return new PenaltyScoreEvent("id", type, "order", "courier", amount, Instant.EPOCH, reason, sequence);
    }
    PubSubPushRequest request(PenaltyScoreEvent event, String version, String subscription) {
        return new PubSubPushRequest(new PubSubMessage(Base64.getEncoder().encodeToString(json.writeValueAsBytes(event)),
                Map.of("eventId",event.eventId(),"eventType",event.eventType(),"eventVersion",version), "broker-id", null), subscription);
    }
    @Test void acceptsBothDirectionsOnTheConfiguredUnifiedSubscription() {
        for (var event:List.of(event("PenaltyScoreAdditionEvent","COURIER_BAD_ATTITUDE",2,1L),
                event("PenaltyScoreAdditionEvent","COURIER_UNRESPONSIVE",3,2L),
                event("PenaltyScoreDeductionEvent","SUCCESSFUL_DELIVERY",1,2L))) {
            consumer.consume(request(event,"2",push.penaltyEventSubscriptionPath()));
            verify(processor).receive(event);
        }
    }
    @Test void rejectsMissingSequenceWrongSubscriptionWrongVersionAndPolicy() {
        var valid=event("PenaltyScoreAdditionEvent","COURIER_BAD_ATTITUDE",2,1L);
        assertThrows(ResponseStatusException.class,()->consumer.consume(request(valid,"1",push.penaltyEventSubscriptionPath())));
        assertThrows(ResponseStatusException.class,()->consumer.consume(request(valid,"2","another-subscription")));
        for(Long sequence:Arrays.asList(null,0L,-1L)) {
            var invalid=event("PenaltyScoreAdditionEvent","COURIER_BAD_ATTITUDE",2,sequence);
            assertThrows(ResponseStatusException.class,()->consumer.consume(request(invalid,"2",push.penaltyEventSubscriptionPath())));
        }
        var invalid=event("PenaltyScoreDeductionEvent","COURIER_BAD_ATTITUDE",2,1L);
        assertThrows(ResponseStatusException.class,()->consumer.consume(request(invalid,"2",push.penaltyEventSubscriptionPath())));
        verifyNoInteractions(processor);
    }
    @Test void receiptFailureIsNotAcknowledged() {
        var event=event("PenaltyScoreAdditionEvent","COURIER_BAD_ATTITUDE",2,1L);
        doThrow(new IllegalStateException("Mongo unavailable")).when(processor).receive(event);
        assertThrows(IllegalStateException.class,()->consumer.consume(request(event,"2",push.penaltyEventSubscriptionPath())));
    }
    @Test void legacyConcurrentDuplicateIsAcknowledgedOnlyAfterItsProcessedIdExists() {
        doThrow(new org.springframework.dao.DuplicateKeyException("concurrent receipt")).when(legacy).process(any(),anyInt());
        when(legacy.wasProcessed("id")).thenReturn(true);
        var addition=event("PenaltyScoreAdditionEvent","COURIER_UNRESPONSIVE",3,null);
        var deduction=event("PenaltyScoreDeductionEvent","SUCCESSFUL_DELIVERY",1,null);
        assertDoesNotThrow(()->consumer.consumeAddition(request(addition,"1",push.penaltyAdditionSubscriptionPath())));
        assertDoesNotThrow(()->consumer.consumeDeduction(request(deduction,"1",push.penaltyDeductionSubscriptionPath())));
    }
    @Test void unrelatedLegacyDuplicateKeyFailureMustNotAcknowledgeALostScore() {
        doThrow(new org.springframework.dao.DuplicateKeyException("unrelated key conflict")).when(legacy).process(any(),anyInt());
        when(legacy.wasProcessed("id")).thenReturn(false);
        var addition=event("PenaltyScoreAdditionEvent","COURIER_UNRESPONSIVE",3,null);
        var deduction=event("PenaltyScoreDeductionEvent","SUCCESSFUL_DELIVERY",1,null);
        assertThrows(org.springframework.dao.DuplicateKeyException.class,()->consumer.consumeAddition(request(addition,"1",push.penaltyAdditionSubscriptionPath())));
        assertThrows(org.springframework.dao.DuplicateKeyException.class,()->consumer.consumeDeduction(request(deduction,"1",push.penaltyDeductionSubscriptionPath())));
    }
}
