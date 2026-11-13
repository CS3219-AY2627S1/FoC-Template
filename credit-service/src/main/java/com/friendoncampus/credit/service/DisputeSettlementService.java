package com.friendoncampus.credit.service;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import com.friendoncampus.credit.domain.ReservationStatus;
import com.friendoncampus.credit.repository.CreditReservationRepository;
import tools.jackson.databind.json.JsonMapper;

/** Credit alone applies the approved disposition; effect and original receipt commit together. */
@Service public class DisputeSettlementService {
 private final JdbcTemplate db;private final CreditReservationRepository reservations;private final CreditReservationService releases;private final CreditSettlementService settlements;
 private com.friendoncampus.credit.integration.CreditOutboxService outbox;
 @org.springframework.beans.factory.annotation.Autowired public void outbox(com.friendoncampus.credit.integration.CreditOutboxService outbox){this.outbox=outbox;}
 private final JsonMapper json=JsonMapper.builder().build();
 public DisputeSettlementService(JdbcTemplate db,CreditReservationRepository reservations,CreditReservationService releases,CreditSettlementService settlements){this.db=db;this.reservations=reservations;this.releases=releases;this.settlements=settlements;}
 @Transactional public String settle(UUID operation,UUID caseId,UUID orderId,UUID actor,UUID requester,UUID courier,String disposition){
  if(operation==null||caseId==null||orderId==null||actor==null||requester==null||disposition==null||!Set.of("RETURN_TO_REQUESTER","PAY_COURIER","KEEP_EXISTING").contains(disposition))throw error("Invalid dispute settlement");
  db.query("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",r->null,"dispute:"+orderId);
  var previous=db.queryForList("SELECT * FROM credit_dispute_receipts WHERE operation_id=? OR (case_id=? AND order_id=?)",operation,caseId,orderId);
  if(!previous.isEmpty()){
   var p=previous.get(0);if(!operation.equals(p.get("operation_id"))||!caseId.equals(p.get("case_id"))||!orderId.equals(p.get("order_id"))||!actor.equals(p.get("actor_id"))||!requester.equals(p.get("requester_id"))||!Objects.equals(courier,p.get("courier_id"))||!disposition.equals(p.get("disposition")))throw error("Resume the original settlement operation");
   return (String)p.get("response_body");
  }
  var reservation=reservations.findByOrderIdForUpdate(orderId).orElse(null);
  if(reservation!=null&&!requester.equals(reservation.getRequesterId()))throw error("Reservation requester does not match Order");
  if(reservation!=null&&reservation.getStatus()==ReservationStatus.ACTIVE){
   if("RETURN_TO_REQUESTER".equals(disposition))releases.release(operation,orderId);
   else if("PAY_COURIER".equals(disposition)&&courier!=null)settlements.settle(operation,orderId,courier);
   else throw error("Choose where to settle the reserved credits");
  }else if(!"KEEP_EXISTING".equals(disposition))throw error("There is no active reservation; preserve the recorded credit outcome");
  String status=reservation==null?"ABSENT":reservation.getStatus().name();
  String body=json.writeValueAsString(Map.of("operationId",operation,"caseId",caseId,"orderId",orderId,"disposition",disposition,"reservationStatus",status,"complete",true));
  var payload=new LinkedHashMap<String,Object>();payload.put("operationId",operation);payload.put("orderId",orderId);payload.put("caseId",caseId);payload.put("disposition",disposition);payload.put("reservationStatus",status);
  long version=db.queryForObject("SELECT COALESCE(MAX(aggregate_version),0)+1 FROM credit_outbox_events WHERE aggregate_type='Order' AND aggregate_id=?",Long.class,orderId);
  outbox.enqueue(new com.friendoncampus.credit.integration.CreditEventEnvelope(UUID.randomUUID(),"DisputeCreditsFinalized",1,"Order",orderId,version,java.time.OffsetDateTime.now(java.time.ZoneOffset.UTC),"credit-service",caseId,null,json.writeValueAsString(Map.of("type","USER","role","ADMIN","userId",actor)),json.writeValueAsString(payload)));
  db.update("INSERT INTO credit_dispute_receipts(operation_id,case_id,order_id,actor_id,requester_id,courier_id,disposition,response_body) VALUES (?,?,?,?,?,?,?,?)",operation,caseId,orderId,actor,requester,courier,disposition,body);
  return body;
 }
 private static ResponseStatusException error(String message){return new ResponseStatusException(HttpStatus.CONFLICT,message);}
}
