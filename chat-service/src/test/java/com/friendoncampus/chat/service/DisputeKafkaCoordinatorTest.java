package com.friendoncampus.chat.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import com.friendoncampus.chat.authorization.CurrentAuthorization;
import com.friendoncampus.chat.dispute.*;
import tools.jackson.databind.json.JsonMapper;

class DisputeKafkaCoordinatorTest {
    @Test void finalizationForAdminDoesNotBecomeARetryingChatCommand(){
        var bus=mock(DisputeBus.class);var chat=mock(AdminChatContractService.class);var current=mock(CurrentAuthorization.class);var internal=mock(InternalServiceClient.class);
        var owner=new DisputeCoordinator(bus,chat,current,internal);var json=JsonMapper.builder().build();
        var result=new DisputeBus.Message(UUID.randomUUID(),1,"OrderDisputeFinalized","order-service",UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),"ADMIN",Instant.now(),json.valueToTree(Map.of("resolved",true)));
        owner.authorize(result);owner.handle(result);verifyNoInteractions(bus,chat,current,internal);
    }
    @Test void closureRechecksTheAuthoritativeReviewerAndOriginalOperationBeforeDraining(){
        var chat=mock(AdminChatContractService.class);var current=mock(CurrentAuthorization.class);var internal=mock(InternalServiceClient.class);
        var owner=new DisputeCoordinator(mock(DisputeBus.class),chat,current,internal);var json=JsonMapper.builder().build();
        UUID actor=UUID.randomUUID(),order=UUID.randomUUID(),caseId=UUID.randomUUID(),operation=UUID.randomUUID();
        var command=new DisputeBus.Message(UUID.randomUUID(),1,"PrepareResolution","admin-service",operation,caseId,order,actor,"ADMIN",Instant.now(),json.valueToTree(Map.of("disposition","KEEP_EXISTING")));
        when(internal.caseAccess(caseId,actor,null)).thenReturn(json.valueToTree(Map.of("canReadEvidence",true,"reviewerId",UUID.randomUUID(),"orderId",order,"closureOperationId",operation)));
        assertThrows(IllegalArgumentException.class,()->owner.authorize(command));verifyNoInteractions(chat);
        when(internal.caseAccess(caseId,actor,null)).thenReturn(json.valueToTree(Map.of("canReadEvidence",true,"reviewerId",actor,"orderId",order,"closureOperationId",operation)));
        owner.authorize(command);verify(current,times(2)).require(actor,"ADMIN");
    }
}
