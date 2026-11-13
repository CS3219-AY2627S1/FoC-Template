package com.friendoncampus.admin.dispute;

import java.util.*;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import com.friendoncampus.admin.*;
import static com.friendoncampus.admin.dispute.DisputeBus.Message;

@Service
public class DisputeCoordinator implements DisputeBus.Handler {
    private final DisputeBus bus;private final JdbcTemplate db;private final UserEligibilityClient users;
    private final ObjectProvider<CaseService> cases;private final ObjectProvider<ResolutionService> resolutions;
    public DisputeCoordinator(DisputeBus bus,JdbcTemplate db,UserEligibilityClient users,ObjectProvider<CaseService> cases,ObjectProvider<ResolutionService> resolutions){this.bus=bus;this.db=db;this.users=users;this.cases=cases;this.resolutions=resolutions;}
    public void authorize(Message m){
        var request=bus.fact(m.operationId(),"REQUEST").orElseThrow(()->new IllegalArgumentException("Unknown operation"));
        same(request,m);
        var account=users.find(m.actorId());
        if(!account.active()||("ADMIN".equals(m.actorRole())&&!account.administrator()))throw new IllegalStateException("Current actor authorization unavailable or denied");
    }
    public static void same(Message a,Message b){
        if(!a.caseId().equals(b.caseId())||!a.orderId().equals(b.orderId())||!a.actorId().equals(b.actorId())||!a.actorRole().equals(b.actorRole()))throw new IllegalArgumentException("Conflicting operation identities");
    }
    public void handle(Message m){
        var request=bus.fact(m.operationId(),"REQUEST").orElseThrow();same(request,m);
        if("PrepareReview".equals(request.type())){
            if(!(("OrderReviewFrozen".equals(m.type())&&"order-service".equals(m.producer()))||("ErrandReviewPrepared".equals(m.type())&&"chat-service".equals(m.producer()))))throw new IllegalArgumentException("Unexpected review outcome");
            bus.remember(m,m.type());
            var order=bus.fact(m.operationId(),"OrderReviewFrozen");var chat=bus.fact(m.operationId(),"ErrandReviewPrepared");
            if(order.isEmpty()||chat.isEmpty())return;
            same(order.get(),chat.get());
            if(!chat.get().data().path("readOnly").asBoolean()||!order.get().eventId().toString().equals(chat.get().data().path("orderConfirmationId").asText()))throw new IllegalArgumentException("Unmatched barrier confirmation");
            if("REPORT".equals(request.data().path("intent").asText()))cases.getObject().completeReport(order.get());
            else {
                // Reconcile older cases from the same authoritative complete Order membership.
                for(var person:order.get().data().path("participants"))db.update("INSERT INTO admin_case_participants(case_id,user_id) VALUES (?,?) ON CONFLICT DO NOTHING",m.caseId(),UUID.fromString(person.asText()));
                db.update("UPDATE admin_cases SET review_status='READY' WHERE id=? AND order_id=?",m.caseId(),m.orderId());
            }
            bus.stop(m.operationId());
        }else if("PrepareResolution".equals(request.type())){
            if(!(("OrderDisputeFinalized".equals(m.type())&&"order-service".equals(m.producer()))||("CaseClosurePrepared".equals(m.type())&&"chat-service".equals(m.producer()))))throw new IllegalArgumentException("Unexpected resolution outcome");
            bus.remember(m,m.type());
            var order=bus.fact(m.operationId(),"OrderDisputeFinalized");var chat=bus.fact(m.operationId(),"CaseClosurePrepared");
            if(order.isEmpty()||chat.isEmpty())return;
            if(!chat.get().data().path("readOnly").asBoolean()||!order.get().data().path("resolved").asBoolean()||!request.data().path("disposition").equals(order.get().data().path("disposition")))throw new IllegalArgumentException("Incomplete resolution outcome");
            resolutions.getObject().finishConfirmed(order.get(),Map.of("order",order.get(),"chat",chat.get()));bus.stop(m.operationId());
        }else throw new IllegalArgumentException("Unknown request type");
    }
}
