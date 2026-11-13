package sg.edu.nus.foc.order.domain;

import static org.junit.jupiter.api.Assertions.*;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import sg.edu.nus.foc.common.penalty.PenaltySystemPolicy;

class OrderDeferredPenaltyTest {
    private static final Instant NOW=Instant.parse("2026-10-19T10:00:00Z");
    private Order assigned() {
        Order o=Order.open("owner","books","p","d",5,30,NOW,NOW.plusSeconds(7200));
        o.accept("courier",0,NOW.plusSeconds(1));
        return o;
    }
    private Order delivered(boolean late) {
        Order o=assigned();o.start("courier",0,NOW.plusSeconds(10));o.markPickedUp("courier",0);
        o.markDelivered("courier",0,NOW.plusSeconds(late?1900:100));return o;
    }
    @Test void retiredPenaltyCannotBeNewlyApplied() {
        Order order=assigned();
        assertThrows(OrderProblem.class,()->order.applyPenalty("courier",0,PenaltySystemPolicy.COURIER_BAD_ATTITUDE,"admin","Retired",NOW));
        assertNull(order.getAppliedPenalty());
    }
    @Test void storedPenaltyOnlyIncreasesAndDoesNotChangeStatusOrHold() {
        Order o=assigned();o.placeCompletionHold("owner");
        o.applyPenalty("courier",0,PenaltySystemPolicy.ITEM_MISHANDLING_OR_DAMAGE,"admin","Damage",NOW);
        o.applyPenalty("courier",0,PenaltySystemPolicy.WRONG_LOCATION_DELIVERY,"admin","Lower",NOW.plusSeconds(1));
        assertEquals(PenaltySystemPolicy.ITEM_MISHANDLING_OR_DAMAGE,o.getAppliedPenalty());
        assertEquals("Damage",o.getAppliedPenaltyReason());assertEquals(OrderStatus.ACCEPTED,o.getStatus());assertTrue(o.isCompletionHold());
        o.applyPenalty("courier",0,PenaltySystemPolicy.DELIBERATE_ITEM_RETENTION_OR_THEFT,"admin","Theft",NOW.plusSeconds(2));
        assertEquals(10,o.getAppliedPenaltyAmount());
        assertThrows(OrderProblem.class,()->o.applyPenalty("courier",0,null,"admin","Clear",NOW));
        assertThrows(OrderProblem.class,()->o.applyPenalty("courier",0,PenaltySystemPolicy.SUCCESSFUL_DELIVERY,"admin","Reward",NOW));
    }
    @Test void completionChoosesStoredOrOverdueOtherwiseReward() {
        assertEquals(PenaltySystemPolicy.SUCCESSFUL_DELIVERY,delivered(false).penaltyAtCompletion());
        assertEquals(PenaltySystemPolicy.OVERDUE_DELIVERY,delivered(true).penaltyAtCompletion());
        for(boolean late:new boolean[]{false,true}){
            Order o=delivered(late);o.applyPenalty("courier",0,PenaltySystemPolicy.WRONG_LOCATION_DELIVERY,"admin","Wrong location",NOW);
            assertEquals(PenaltySystemPolicy.WRONG_LOCATION_DELIVERY,o.penaltyAtCompletion());
        }
    }
    @Test void adminCancellationIgnoresOverdueAndExplicitlyWaivesScoring() {
        Order innocent=delivered(true);innocent.cancelByAdmin("owner","courier",NOW,null);
        assertNull(innocent.getAdminPenaltyReason());
        Order guilty=delivered(true);guilty.applyPenalty("courier",0,PenaltySystemPolicy.ITEM_MISHANDLING_OR_DAMAGE,"admin","Damage",NOW);
        guilty.cancelByAdmin("owner","courier",NOW,null);
        assertNull(guilty.getAdminPenaltyReason());
        assertEquals(PenaltySystemPolicy.ITEM_MISHANDLING_OR_DAMAGE,guilty.getAppliedPenalty());
    }
    @Test void invalidStateCourierVersionAndPolicyAreRejected() {
        Order o=assigned();
        assertThrows(OrderProblem.class,()->o.applyPenalty("wrong",0,PenaltySystemPolicy.WRONG_LOCATION_DELIVERY,"admin","Reason",NOW));
        assertThrows(OrderProblem.class,()->o.applyPenalty("courier",1,PenaltySystemPolicy.WRONG_LOCATION_DELIVERY,"admin","Reason",NOW));
        assertThrows(OrderProblem.class,()->o.applyPenalty("courier",0,PenaltySystemPolicy.OVERDUE_DELIVERY,"admin","Reason",NOW));
        o.cancelByAdmin("owner","courier",NOW,null);
        assertThrows(OrderProblem.class,()->o.applyPenalty("courier",0,PenaltySystemPolicy.WRONG_LOCATION_DELIVERY,"admin","Reason",NOW));
    }
    @Test void abortArchiveRetainsPenaltyAndReopenedAssignmentStartsClean() {
        Order o=assigned();o.applyPenalty("courier",0,PenaltySystemPolicy.WRONG_LOCATION_DELIVERY,"admin","No response",NOW);
        OrderCourierAttempt archive=new OrderCourierAttempt(o,"courier",0,NOW.plusSeconds(10));
        o.reopenAfterAcceptedCancellation("courier",0,NOW.plusSeconds(10));
        assertNull(o.getAppliedPenalty());assertEquals(PenaltySystemPolicy.WRONG_LOCATION_DELIVERY,Order.historicalAttempt(archive).getAppliedPenalty());
        o.accept("next-courier",0,NOW.plusSeconds(11));assertNull(o.getAppliedPenalty());
    }
    @Test void auditIsRequiredAndEqualPenaltyDoesNotReplaceItsReason() {
        for(String admin:new String[]{null," ","x".repeat(129)}) {
            Order o=assigned();
            assertThrows(OrderProblem.class,()->o.applyPenalty("courier",0,PenaltySystemPolicy.WRONG_LOCATION_DELIVERY,admin,"Reason",NOW));
            assertNull(o.getAppliedPenalty());
        }
        for(String reason:new String[]{null," ","x".repeat(1001)}) {
            Order o=assigned();
            assertThrows(OrderProblem.class,()->o.applyPenalty("courier",0,PenaltySystemPolicy.WRONG_LOCATION_DELIVERY,"admin",reason,NOW));
        }
        Order o=assigned();o.applyPenalty("courier",0,PenaltySystemPolicy.ITEM_MISHANDLING_OR_DAMAGE,"admin","First",NOW);
        o.applyPenalty("courier",0,PenaltySystemPolicy.WRONG_LOCATION_DELIVERY,"admin","Equal",NOW.plusSeconds(1));
        assertEquals(PenaltySystemPolicy.ITEM_MISHANDLING_OR_DAMAGE,o.getAppliedPenalty());assertEquals("First",o.getAppliedPenaltyReason());
        Order unassigned=Order.open("owner","books","p","d",5,30,NOW,NOW.plusSeconds(7200));
        assertThrows(OrderProblem.class,()->unassigned.applyPenalty("courier",0,PenaltySystemPolicy.WRONG_LOCATION_DELIVERY,"admin","Reason",NOW));
    }
    @Test void intermediateActiveStatesAcceptPenaltyAndLegacyWaiverCannotEraseStoredPolicy() {
        for(boolean pickedUp:new boolean[]{false,true}) {
            Order o=assigned();o.start("courier",0,NOW);if(pickedUp)o.markPickedUp("courier",0);
            o.applyPenalty("courier",0,PenaltySystemPolicy.WRONG_LOCATION_DELIVERY,"admin","Reason",NOW);
            assertEquals(4,o.getAppliedPenaltyAmount());
        }
        Order legacy=delivered(true);legacy.waiveOverdue("admin","Historical waiver",NOW.plusSeconds(2000));
        assertNull(legacy.penaltyAtCompletion());
        legacy.applyPenalty("courier",0,PenaltySystemPolicy.ITEM_MISHANDLING_OR_DAMAGE,"admin","Damage",NOW.plusSeconds(2100));
        assertEquals(PenaltySystemPolicy.ITEM_MISHANDLING_OR_DAMAGE,legacy.penaltyAtCompletion());
    }

}
