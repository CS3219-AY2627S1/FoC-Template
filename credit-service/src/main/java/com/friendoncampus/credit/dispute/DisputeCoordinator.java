package com.friendoncampus.credit.dispute;

import java.util.*;
import org.springframework.stereotype.Service;
import com.friendoncampus.credit.authorization.CurrentAuthorization;
import com.friendoncampus.credit.service.DisputeSettlementService;
import static com.friendoncampus.credit.dispute.DisputeBus.Message;
import tools.jackson.databind.json.JsonMapper;

@Service
public class DisputeCoordinator implements DisputeBus.Handler {
    private final DisputeBus bus;private final DisputeSettlementService settlements;private final CurrentAuthorization current;
    private final JsonMapper json=JsonMapper.builder().build();
    public DisputeCoordinator(DisputeBus bus,DisputeSettlementService settlements,CurrentAuthorization current){this.bus=bus;this.settlements=settlements;this.current=current;}
    public void authorize(Message m){current.require(m.actorId(),"ADMIN");}
    public void handle(Message m){
        if(!"order-service".equals(m.producer())||!"SettleDisputeCredits".equals(m.type())||!"ADMIN".equals(m.actorRole()))throw new IllegalArgumentException("Only Order may settle a dispute");
        bus.remember(m,"REQUEST");
        UUID requester=UUID.fromString(m.data().path("requesterId").asText());
        UUID courier=m.data().path("courierId").isNull()?null:UUID.fromString(m.data().path("courierId").asText());
        String body=settlements.settle(m.operationId(),m.caseId(),m.orderId(),m.actorId(),requester,courier,m.data().path("disposition").asText());
        var outcome=(tools.jackson.databind.node.ObjectNode)json.readTree(body);
        outcome.put("requesterId",requester.toString());if(courier==null)outcome.putNull("courierId");else outcome.put("courierId",courier.toString());
        bus.emit("credit.dispute.events","DisputeCreditsSettled",m,outcome,false);
    }
}
