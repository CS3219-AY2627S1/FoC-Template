package com.friendoncampus.chat.dispute;

import java.util.*;
import org.springframework.stereotype.Service;
import com.friendoncampus.chat.authorization.CurrentAuthorization;
import com.friendoncampus.chat.service.AdminChatContractService;
import static com.friendoncampus.chat.dispute.DisputeBus.Message;

@Service
public class DisputeCoordinator implements DisputeBus.Handler {
    private final DisputeBus bus;private final AdminChatContractService chat;private final CurrentAuthorization current;private final com.friendoncampus.chat.service.InternalServiceClient internal;
    public DisputeCoordinator(DisputeBus bus,AdminChatContractService chat,CurrentAuthorization current,com.friendoncampus.chat.service.InternalServiceClient internal){this.bus=bus;this.chat=chat;this.current=current;this.internal=internal;}
    private boolean irrelevant(Message m){return "order-service".equals(m.producer())&&"OrderDisputeFinalized".equals(m.type());}
    public void authorize(Message m){
        if(irrelevant(m))return;
        current.require(m.actorId(),m.actorRole());
        if("admin-service".equals(m.producer())&&"PrepareResolution".equals(m.type())){
            var access=internal.caseAccess(m.caseId(),m.actorId(),null);
            if(!access.path("canReadEvidence").asBoolean()||!m.actorId().toString().equals(access.path("reviewerId").asText())||!m.orderId().toString().equals(access.path("orderId").asText())||!m.operationId().toString().equals(access.path("closureOperationId").asText()))throw new IllegalArgumentException("Current case closure authorization is unconfirmed");
        }
    }
    private void same(Message a,Message b){if(!a.caseId().equals(b.caseId())||!a.orderId().equals(b.orderId())||!a.actorId().equals(b.actorId())||!a.actorRole().equals(b.actorRole()))throw new IllegalArgumentException("Conflicting operation identities");}
    public void handle(Message m){
        // Finalization shares Order's topic; the existing lifecycle projection owns its Chat effects.
        if(irrelevant(m))return;
        if("admin-service".equals(m.producer())&&"PrepareReview".equals(m.type())){bus.remember(m,"REQUEST");prepare(m.operationId());}
        else if("order-service".equals(m.producer())&&"OrderReviewFrozen".equals(m.type())){bus.remember(m,"ORDER_FROZEN");prepare(m.operationId());}
        else if("admin-service".equals(m.producer())&&"PrepareResolution".equals(m.type())&&"ADMIN".equals(m.actorRole())){
            bus.remember(m,"REQUEST");chat.drainClosure(m.caseId(),m.operationId());
            bus.emit("chat.dispute.events","CaseClosurePrepared",m,Map.of("readOnly",true),false);
        }else throw new IllegalArgumentException("Unexpected dispute command");
    }
    private void prepare(UUID operation){
        var command=bus.fact(operation,"REQUEST");var order=bus.fact(operation,"ORDER_FROZEN");if(command.isEmpty()||order.isEmpty())return;
        var request=command.get();var fact=order.get();same(request,fact);
        if(!"PrepareReview".equals(request.type())||!fact.data().path("participants").isArray()||fact.data().path("participants").isEmpty())throw new IllegalArgumentException("Missing authoritative membership");
        boolean participant=false;for(var p:fact.data().path("participants"))participant|=UUID.fromString(p.asText()).equals(request.actorId());
        if(!"ADMIN".equals(request.actorRole())&&!participant)throw new IllegalArgumentException("Reporter is not a participant");
        chat.applyReviewBarrier(request.orderId(),request.caseId());
        bus.emit("chat.dispute.events","ErrandReviewPrepared",request,Map.of("readOnly",true,"orderConfirmationId",fact.eventId()),false);
    }
}
