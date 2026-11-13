package com.friendoncampus.order.service;
import java.time.*;import java.util.*;
import org.springframework.stereotype.Service;import org.springframework.transaction.PlatformTransactionManager;import org.springframework.transaction.support.TransactionTemplate;import org.springframework.http.HttpStatus;import org.springframework.web.server.ResponseStatusException;
import com.friendoncampus.order.domain.*;import com.friendoncampus.order.repository.*;import com.friendoncampus.order.messaging.OrderEventRecorder;
@Service public class DisputeReviewService {
 private final OrderRepository orders;private final OrderTransitionRepository transitions;private final OrderEventRecorder events;private final TransactionTemplate tx;private final Clock clock;
 public DisputeReviewService(OrderRepository orders,OrderTransitionRepository transitions,OrderEventRecorder events,PlatformTransactionManager manager,Clock clock){this.orders=orders;this.transitions=transitions;this.events=events;this.tx=new TransactionTemplate(manager);this.clock=clock;}
 public record Review(UUID orderId,UUID caseId,UUID requesterId,UUID courierId,String state,String creditStatus,boolean resolved,List<UUID> participants){}
 public Review freeze(UUID orderId,UUID caseId,UUID actor,boolean administrator){
  return tx.execute(s->{var order=lock(orderId);var members=members(order);if(!administrator&&!members.contains(actor))throw error(404,"Errand not found");boolean fresh=order.getReviewCaseId()==null;order.freezeForReview(caseId);orders.saveAndFlush(order);
   if(fresh)events.record(order,new OrderTransition(OrderAction.REVIEW_STARTED,order.getState(),order.getState(),null,ActorRole.SYSTEM,order.getCourierId(),null,CreditEffect.NONE,"OrderReviewStarted",OffsetDateTime.now(clock)));
   return view(order,members);
  });
 }
 public Review read(UUID orderId,UUID caseId){return tx.execute(s->{var order=lock(orderId);if(!caseId.equals(order.getReviewCaseId()))throw error(404,"Review not found");return view(order,members(order));});}
 public Review prepare(UUID orderId,UUID caseId,UUID operation,String disposition,UUID reviewer){
  return tx.execute(s->{var order=lock(orderId);if(!caseId.equals(order.getReviewCaseId()))throw error(409,"Review is not frozen");if(members(order).contains(reviewer))throw error(403,"An independent reviewer is required");validateDisposition(order,disposition);order.prepareReviewResolution(caseId,operation,disposition);orders.saveAndFlush(order);return view(order,members(order));});
 }
 public Review complete(UUID orderId,UUID caseId,UUID operation,String disposition,String reservationStatus){
  if(!Set.of("ABSENT","ACTIVE","RELEASED","SETTLED","COMPENSATED").contains(reservationStatus))throw error(409,"Invalid credit confirmation");
  if(("RETURN_TO_REQUESTER".equals(disposition)&&!"RELEASED".equals(reservationStatus))||("PAY_COURIER".equals(disposition)&&!"SETTLED".equals(reservationStatus))||("KEEP_EXISTING".equals(disposition)&&"ACTIVE".equals(reservationStatus)))throw error(409,"Credit disposition was not confirmed");
  return tx.execute(s->{var order=lock(orderId);order.prepareReviewResolution(caseId,operation,disposition);if(!order.isResolvedAfterReview()){
   if(!"ABSENT".equals(reservationStatus))order.recordCreditStatus(CreditStatus.valueOf(reservationStatus));
   var transition=order.finishReview(OffsetDateTime.now(clock));orders.saveAndFlush(order);events.record(order,transition);
  }return view(order,members(order));});
 } private void validateDisposition(com.friendoncampus.order.domain.Order order,String disposition){
  if(disposition==null||!Set.of("RETURN_TO_REQUESTER","PAY_COURIER","KEEP_EXISTING").contains(disposition))throw error(400,"Choose a credit outcome");
  if(order.getReviewResolutionId()!=null)return;
  boolean held=order.getCreditStatus()==CreditStatus.RESERVED;
  if(held&&"KEEP_EXISTING".equals(disposition)||!held&&!"KEEP_EXISTING".equals(disposition)||"PAY_COURIER".equals(disposition)&&order.getCourierId()==null)throw error(409,"Choose a credit outcome consistent with the confirmed reservation");
 }
 private com.friendoncampus.order.domain.Order lock(UUID id){return orders.findByIdForUpdate(id).orElseThrow(()->error(404,"Errand not found"));}
 private List<UUID> members(com.friendoncampus.order.domain.Order order){var ids=new TreeSet<UUID>();ids.add(order.getRequesterId());if(order.getCourierId()!=null)ids.add(order.getCourierId());for(var r:transitions.findByOrderIdOrderByOccurredAtAscOrderVersionAsc(order.getId()))if(r.getCourierId()!=null)ids.add(r.getCourierId());return List.copyOf(ids);}
 private Review view(com.friendoncampus.order.domain.Order o,List<UUID> members){return new Review(o.getId(),o.getReviewCaseId(),o.getRequesterId(),o.getCourierId(),o.getState().name(),o.getCreditStatus()==null?null:o.getCreditStatus().name(),o.isResolvedAfterReview(),members);}
 private static ResponseStatusException error(int code,String message){return new ResponseStatusException(HttpStatus.valueOf(code),message);}
}
