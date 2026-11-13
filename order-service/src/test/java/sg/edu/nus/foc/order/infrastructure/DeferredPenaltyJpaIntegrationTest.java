package sg.edu.nus.foc.order.infrastructure;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import sg.edu.nus.foc.common.penalty.PenaltySystemPolicy;
import sg.edu.nus.foc.order.application.*;
import sg.edu.nus.foc.order.domain.CommandReceipt;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.domain.OrderProblem;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(properties={"spring.profiles.active=local","order.lifecycle.cron=-","order.messaging.outbox.recovery-cron=-"})
@Testcontainers
class DeferredPenaltyJpaIntegrationTest {
    @Container private static final PostgreSQLContainer<?> POSTGRES=new PostgreSQLContainer<>("postgres:15-alpine").withDatabaseName("deferred_penalty").withUsername("order_test").withPassword("order_test_password");
    @DynamicPropertySource static void database(DynamicPropertyRegistry p){p.add("spring.datasource.url",POSTGRES::getJdbcUrl);p.add("spring.datasource.username",POSTGRES::getUsername);p.add("spring.datasource.password",POSTGRES::getPassword);}
    @Autowired private AdminApplyPenaltyService applications;
    @Autowired private AdminOrderCancellationService cancellations;
    @Autowired private OrderTransitionService transitions;
    @Autowired private JpaOrderRepository orders;
    @Autowired private JpaOrderCourierAttemptRepository attempts;
    @Autowired private JpaOrderEventOutboxRepository outbox;
    @Autowired private JpaPenaltyOutcomeRepository outcomes;
    @Autowired private JpaCommandReceiptRepository receipts;
    @Autowired private JsonMapper json;
    @MockitoBean private OrderOutboxDispatcher dispatcher;
    @MockitoSpyBean private CommandReceiptPersistenceAdapter receiptAdapter;
    @BeforeEach void clear(){reset(receiptAdapter);outbox.deleteAll();outcomes.deleteAll();receipts.deleteAll();}
    private Order delivered(boolean late, boolean old){
        Instant delivered=old?Instant.now().minusSeconds(49*3600):Instant.now();
        Order o=Order.open("owner","books","p","d",5,30,delivered.minusSeconds(7200),Instant.now().plusSeconds(3600));
        o.accept("courier",0,delivered.minusSeconds(7100));o.start("courier",0,delivered.minusSeconds(late?3600:60));o.markPickedUp("courier",0);o.markDelivered("courier",0,delivered);return orders.saveAndFlush(o);
    }
    private Order apply(Order o,String cmd,PenaltySystemPolicy policy){return applications.apply(cmd,o.getId(),"courier",o.getVersion(),policy,"Investigation: "+cmd,"admin");}
    @Test void unresponsivenessPersistsAndWinsOverOverdueOnlyAtCompletion() {
        Order order = apply(delivered(true, false), "unresponsive", PenaltySystemPolicy.COURIER_UNRESPONSIVE);
        assertEquals(PenaltySystemPolicy.COURIER_UNRESPONSIVE,
                orders.findById(order.getId()).orElseThrow().getAppliedPenalty());
        assertEquals(0, outbox.count());
        transitions.complete("complete-attitude", order.getId(), "owner", order.getVersion(), null);
        assertEquals(3, outcomes.findByOrderIdOrderByCreatedAtAsc(order.getId()).getFirst().getSignedAmount());
        assertEquals(1, outbox.findAll().stream().filter(event -> "PenaltyScoreAdditionEvent".equals(event.getEventType())).count());
    }
    @Test void badAttitudeRemainsReadableWhenTheCourierAttemptIsArchived() {
        Instant now = Instant.now();
        Order order = Order.open("owner", "books", "p", "d", 5, 30, now, now.plusSeconds(3600));
        order.accept("courier", 0, now);
        // Simulate a previously persisted policy; new application now rejects this retired case.
        org.springframework.test.util.ReflectionTestUtils.setField(order, "appliedPenalty", PenaltySystemPolicy.COURIER_BAD_ATTITUDE);
        org.springframework.test.util.ReflectionTestUtils.setField(order, "appliedPenaltyAt", now);
        org.springframework.test.util.ReflectionTestUtils.setField(order, "appliedPenaltyBy", "admin");
        org.springframework.test.util.ReflectionTestUtils.setField(order, "appliedPenaltyReason", "Historical decision");
        order = orders.saveAndFlush(order);
        String orderId = order.getId();
        // This test isolates archival persistence after an externally confirmed Credit step.
        transitions.abortConfirmed("abort-attitude", orderId, "courier", order.getVersion(), null);
        assertTrue(attempts.findAll().stream().anyMatch(attempt -> orderId.equals(attempt.getOrderId())
                && attempt.getAppliedPenalty() == PenaltySystemPolicy.COURIER_BAD_ATTITUDE));
        assertNull(orders.findById(orderId).orElseThrow().getAppliedPenalty());
    }
    @Test void storingHighestPenaltyOnHeldOrderIsAtomicIdempotentAndEmitsNothing(){
        Order o=delivered(true,false);o.placeCompletionHold("owner");o=orders.saveAndFlush(o);
        Order first=apply(o,"damage",PenaltySystemPolicy.ITEM_MISHANDLING_OR_DAMAGE);
        applications.apply("damage",o.getId(),"courier",o.getVersion(),PenaltySystemPolicy.ITEM_MISHANDLING_OR_DAMAGE,"Investigation: damage","admin");
        Order lower=apply(first,"lower",PenaltySystemPolicy.WRONG_LOCATION_DELIVERY);
        assertEquals(4,lower.getAppliedPenaltyAmount());assertEquals(first.getVersion(),lower.getVersion());assertEquals("Investigation: damage",lower.getAppliedPenaltyReason());
        Order highest=apply(lower,"theft",PenaltySystemPolicy.DELIBERATE_ITEM_RETENTION_OR_THEFT);
        assertEquals(10,orders.findById(o.getId()).orElseThrow().getAppliedPenaltyAmount());assertTrue(highest.isCompletionHold());assertEquals(OrderStatus.DELIVERED,highest.getStatus());
        assertEquals(0,outbox.count());assertEquals(0,outcomes.count());assertEquals(3,receipts.count());verifyNoInteractions(dispatcher);
    }
    @Test void receiptFailureRollsBackPenaltyAndLeavesNoEvent(){
        Order o=delivered(false,false);
        doAnswer(call->{receiptAdapterSave(call.getArgument(0));throw new IllegalStateException("After receipt");}).when(receiptAdapter).save(any(CommandReceipt.class));
        assertThrows(RuntimeException.class,()->apply(o,"rollback",PenaltySystemPolicy.WRONG_LOCATION_DELIVERY));
        assertNull(orders.findById(o.getId()).orElseThrow().getAppliedPenalty());assertEquals(0,receipts.count());assertEquals(0,outbox.count());
    }
    private void receiptAdapterSave(CommandReceipt receipt){receipts.saveAndFlush(receipt);}
    @Test void requesterCompletionPublishesExactlyOneHighestOutcome(){
        for(boolean late:new boolean[]{false,true}){
            Order o=apply(delivered(late,false),"complete-"+late,PenaltySystemPolicy.ITEM_MISHANDLING_OR_DAMAGE);
            transitions.complete("finish-"+late,o.getId(),"owner",o.getVersion(),null);
            List<sg.edu.nus.foc.order.domain.OrderEventOutbox> events=outbox.findAll().stream().filter(e->o.getId().equals(e.getOrderId())).toList();
            assertEquals(2,events.size());assertEquals(1,events.stream().filter(e->"PenaltyScoreAdditionEvent".equals(e.getEventType())).count());
            assertTrue(events.stream().filter(e->e.getEventType().startsWith("PenaltyScore")).allMatch(e->json.readTree(e.getPayload()).path("penaltyAmount").asInt()==4));
            assertEquals(4,outcomes.findByOrderIdOrderByCreatedAtAsc(o.getId()).getFirst().getSignedAmount());
            assertThrows(OrderProblem.class,()->apply(orders.findById(o.getId()).orElseThrow(),"too-late-"+late,PenaltySystemPolicy.DELIBERATE_ITEM_RETENTION_OR_THEFT));
        }
    }
    @Test void noStoredPenaltyUsesOverdueOrSuccessfulDeliveryAndAutomaticCompletionUsesStoredPenalty(){
        for(boolean late:new boolean[]{false,true}){
            Order o=delivered(late,false);transitions.complete("normal-"+late,o.getId(),"owner",o.getVersion(),null);
            assertEquals(late?1:-1,outcomes.findByOrderIdOrderByCreatedAtAsc(o.getId()).getFirst().getSignedAmount());
        }
        Order automatic=apply(delivered(true,true),"auto-penalty",PenaltySystemPolicy.WRONG_LOCATION_DELIVERY);
        assertTrue(transitions.autoComplete(automatic.getId(),Instant.now()));assertFalse(transitions.autoComplete(automatic.getId(),Instant.now()));
        assertEquals(4,outcomes.findByOrderIdOrderByCreatedAtAsc(automatic.getId()).getFirst().getSignedAmount());
    }
    @Test void explicitNoPenaltyRecordsZeroOutcomeDespiteStoredPolicy() {
        Order o = apply(delivered(true, false), "stored-for-waiver", PenaltySystemPolicy.DELIBERATE_ITEM_RETENTION_OR_THEFT);
        cancellations.cancel(o.getId(), "owner", "courier", List.of(), "admin", "Courier cleared");
        Order cancelled = orders.findById(o.getId()).orElseThrow();
        assertEquals(OrderStatus.CANCELLED, cancelled.getStatus());
        assertEquals(0, cancelled.getAdminPenaltyAmount());
        assertEquals(PenaltySystemPolicy.DELIBERATE_ITEM_RETENTION_OR_THEFT, cancelled.getAppliedPenalty());
        assertEquals(0, outcomes.findByOrderIdOrderByCreatedAtAsc(o.getId()).getFirst().getSignedAmount());
        assertEquals(1, outbox.count());
        assertEquals("OpenOrderRefundTaskEvent", outbox.findAll().getFirst().getEventType());
    }
    @Test void adminCancelIgnoresOverdueAndUsesStoredPenaltyWhenAdditionSelected(){
        Order innocent=delivered(true,false);cancellations.cancel(innocent.getId(),"owner","courier",null,"admin","False alarm");
        assertEquals(1,outbox.count());assertEquals(0,outcomes.findByOrderIdOrderByCreatedAtAsc(innocent.getId()).getFirst().getSignedAmount());
        Order guilty=apply(delivered(true,false),"guilty",PenaltySystemPolicy.ITEM_MISHANDLING_OR_DAMAGE);
        cancellations.cancel(guilty.getId(),"owner","courier",java.util.List.of(PenaltySystemPolicy.OVERDUE_DELIVERY),"admin","Refund with stored penalty");
        assertEquals(PenaltySystemPolicy.ITEM_MISHANDLING_OR_DAMAGE,orders.findById(guilty.getId()).orElseThrow().getAdminPenaltyReason());
        assertEquals(4,outcomes.findByOrderIdOrderByCreatedAtAsc(guilty.getId()).getFirst().getSignedAmount());
        assertEquals(3,outbox.count());assertEquals(0,outbox.findAll().stream().filter(e->"PenaltyScoreDeductionEvent".equals(e.getEventType())).count());
    }
}
