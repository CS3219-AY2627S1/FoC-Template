package com.friendoncampus.order.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import com.friendoncampus.order.authorization.CurrentAuthorization;
import com.friendoncampus.order.dispute.*;
import tools.jackson.databind.json.JsonMapper;

class DisputeKafkaCoordinatorTest {
    final UUID operation=UUID.randomUUID(),caseId=UUID.randomUUID(),order=UUID.randomUUID(),actor=UUID.randomUUID(),requester=UUID.randomUUID();
    final JsonMapper json=JsonMapper.builder().build();
    DisputeBus.Message message(String producer,String type,Object data){return new DisputeBus.Message(UUID.randomUUID(),1,type,producer,operation,caseId,order,actor,"ADMIN",Instant.now(),json.valueToTree(data));}
    @Test void neverAsksCreditUntilBothDecisionAndChatDrainAreCommitted(){
        var bus=mock(DisputeBus.class);var reviews=mock(DisputeReviewService.class);var current=mock(CurrentAuthorization.class);var owner=new DisputeCoordinator(bus,reviews,current);
        var command=message("admin-service","PrepareResolution",Map.of("disposition","RETURN_TO_REQUESTER"));
        when(bus.fact(operation,"REQUEST")).thenReturn(Optional.of(command));when(bus.fact(operation,"CHAT_CLOSED")).thenReturn(Optional.empty());
        owner.handle(command);verifyNoInteractions(reviews);verify(bus,never()).emit(anyString(),anyString(),any(),any(),anyBoolean());
        var chat=message("chat-service","CaseClosurePrepared",Map.of("readOnly",true));when(bus.fact(operation,"CHAT_CLOSED")).thenReturn(Optional.of(chat));
        var frozen=new DisputeReviewService.Review(order,caseId,requester,null,"OPEN","RESERVED",false,List.of(requester));
        when(reviews.prepare(order,caseId,operation,"RETURN_TO_REQUESTER",actor)).thenReturn(frozen);
        when(bus.fact(operation,"CREDIT_SETTLED")).thenReturn(Optional.empty());owner.handle(chat);
        verify(bus).emit(eq("order.dispute.commands"),eq("SettleDisputeCredits"),eq(command),any(),eq(true));verify(reviews,never()).complete(any(),any(),any(),anyString(),anyString());
        var payload=new LinkedHashMap<String,Object>();payload.put("complete",true);payload.put("disposition","RETURN_TO_REQUESTER");payload.put("reservationStatus","RELEASED");payload.put("requesterId",requester);payload.put("courierId",null);
        var credit=message("credit-service","DisputeCreditsSettled",payload);when(bus.fact(operation,"CREDIT_SETTLED")).thenReturn(Optional.of(credit));
        when(reviews.complete(order,caseId,operation,"RETURN_TO_REQUESTER","RELEASED")).thenReturn(new DisputeReviewService.Review(order,caseId,requester,null,"COMPLETED","RELEASED",true,List.of(requester)));
        owner.handle(credit);verify(reviews).complete(order,caseId,operation,"RETURN_TO_REQUESTER","RELEASED");verify(bus).stop(operation);
        verify(bus).emit(eq("order.dispute.events"),eq("OrderDisputeFinalized"),eq(command),any(),eq(false));
    }
    @Test void aForgedProducerCannotFreezeTheErrand(){
        var bus=mock(DisputeBus.class);var reviews=mock(DisputeReviewService.class);var owner=new DisputeCoordinator(bus,reviews,mock(CurrentAuthorization.class));
        assertThrows(IllegalArgumentException.class,()->owner.handle(message("credit-service","PrepareReview",Map.of("intent","LEGACY"))));verifyNoInteractions(reviews);
    }
    @Test void anAdminOnlyBarrierOutcomeIsDurablyIgnoredWithoutAuthorizationOrEffects(){
        var bus=mock(DisputeBus.class);var reviews=mock(DisputeReviewService.class);var current=mock(CurrentAuthorization.class);var owner=new DisputeCoordinator(bus,reviews,current);
        var unrelated=message("chat-service","ErrandReviewPrepared",Map.of("readOnly",true,"orderConfirmationId",UUID.randomUUID()));
        owner.authorize(unrelated);owner.handle(unrelated);verifyNoInteractions(bus,reviews,current);
    }
}
