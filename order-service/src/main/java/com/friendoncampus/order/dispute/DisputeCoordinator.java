package com.friendoncampus.order.dispute;

import java.util.*;
import org.springframework.stereotype.Service;
import com.friendoncampus.order.authorization.CurrentAuthorization;
import com.friendoncampus.order.service.DisputeReviewService;
import static com.friendoncampus.order.dispute.DisputeBus.Message;
import tools.jackson.databind.json.JsonMapper;

@Service
public class DisputeCoordinator implements DisputeBus.Handler {
    private final DisputeBus bus;private final DisputeReviewService reviews;private final CurrentAuthorization current;
    private final JsonMapper json=JsonMapper.builder().build();
    public DisputeCoordinator(DisputeBus bus,DisputeReviewService reviews,CurrentAuthorization current){this.bus=bus;this.reviews=reviews;this.current=current;}
    private boolean irrelevant(Message m){return "chat-service".equals(m.producer())&&"ErrandReviewPrepared".equals(m.type());}
    public void authorize(Message m){if(!irrelevant(m))current.require(m.actorId(),m.actorRole());}
    private void same(Message a,Message b){if(!a.caseId().equals(b.caseId())||!a.orderId().equals(b.orderId())||!a.actorId().equals(b.actorId())||!a.actorRole().equals(b.actorRole()))throw new IllegalArgumentException("Conflicting operation identities");}
    public void handle(Message m){
        // This valid event shares Chat's outcome topic, but Admin is its only logical consumer.
        if(irrelevant(m))return;
        if("admin-service".equals(m.producer())&&"PrepareReview".equals(m.type())){
            bus.remember(m,"REQUEST");
            var review=reviews.freeze(m.orderId(),m.caseId(),m.actorId(),"ADMIN".equals(m.actorRole()));
            bus.emit("order.dispute.events","OrderReviewFrozen",m,review,false);return;
        }
        if(!"ADMIN".equals(m.actorRole()))throw new IllegalArgumentException("Administrator mode required");
        if("admin-service".equals(m.producer())&&"PrepareResolution".equals(m.type()))bus.remember(m,"REQUEST");
        else if("chat-service".equals(m.producer())&&"CaseClosurePrepared".equals(m.type()))bus.remember(m,"CHAT_CLOSED");
        else if("credit-service".equals(m.producer())&&"DisputeCreditsSettled".equals(m.type()))bus.remember(m,"CREDIT_SETTLED");
        else throw new IllegalArgumentException("Unexpected owner outcome");
        var command=bus.fact(m.operationId(),"REQUEST");var chat=bus.fact(m.operationId(),"CHAT_CLOSED");
        if(command.isEmpty()||chat.isEmpty())return;
        var request=command.get();same(request,chat.get());
        if(!"PrepareResolution".equals(request.type())||!chat.get().data().path("readOnly").asBoolean())throw new IllegalArgumentException("Closure is unconfirmed");
        String disposition=request.data().path("disposition").asText();
        var review=reviews.prepare(request.orderId(),request.caseId(),request.operationId(),disposition,request.actorId());
        var credit=bus.fact(m.operationId(),"CREDIT_SETTLED");
        if(credit.isEmpty()){
            var data=new LinkedHashMap<String,Object>();data.put("requesterId",review.requesterId());data.put("courierId",review.courierId());data.put("disposition",disposition);
            bus.emit("order.dispute.commands","SettleDisputeCredits",request,data,true);return;
        }
        same(request,credit.get());
        if(!credit.get().data().path("complete").asBoolean()||!disposition.equals(credit.get().data().path("disposition").asText()))throw new IllegalArgumentException("Credit settlement is unconfirmed");
        if(!review.requesterId().toString().equals(credit.get().data().path("requesterId").asText())||!Objects.equals(review.courierId(),credit.get().data().path("courierId").isNull()?null:UUID.fromString(credit.get().data().path("courierId").asText())))throw new IllegalArgumentException("Credit participant identities do not match Order");
        String status=credit.get().data().path("reservationStatus").asText();
        var finished=reviews.complete(request.orderId(),request.caseId(),request.operationId(),disposition,status);
        var data=json.valueToTree(finished).deepCopy();
        ((tools.jackson.databind.node.ObjectNode)data).put("disposition",disposition);
        ((tools.jackson.databind.node.ObjectNode)data).put("creditConfirmationId",credit.get().eventId().toString());
        bus.emit("order.dispute.events","OrderDisputeFinalized",request,data,false);bus.stop(m.operationId());
    }
}
