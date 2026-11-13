package sg.edu.nus.foc.order.domain;

import static org.junit.jupiter.api.Assertions.*;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class OrderFieldValidationTest {
    private final Instant now = Instant.parse("2026-10-09T08:00:00Z");

    @Test
    void blankAndOversizedCreationFieldsAreSpecific() {
        OrderProblem missing = assertThrows(OrderProblem.class, () -> Order.open(null, null, null, null, 1, 15, now, null));
        assertEquals(java.util.Set.of("requesterId", "itemDescription", "pickupSupplierId", "deliverySupplierId", "expiresAt"),
                missing.getDetails().stream().map(OrderProblem.Detail::getField).collect(java.util.stream.Collectors.toSet()));
        assertThrows(OrderProblem.class, () -> Order.open(" ", " ", " ", " ", 1, 15, now, now.plusSeconds(3600)));
        OrderProblem longDescription = assertThrows(OrderProblem.class, () -> Order.open("owner", "x".repeat(101), "p", "d", 1, 15, now, now.plusSeconds(3600)));
        assertEquals("itemDescription", longDescription.getDetails().getFirst().getField());
    }

    @Test
    void manualMinimumIsInclusiveAndAutomaticExecutionIsNotExtended() {
        Order original = Order.open("owner", "item", "p", "d", 1, 15, now.minusSeconds(3600), now);
        original.expire(0, now);
        assertThrows(OrderProblem.class, () -> original.createManualRepost("item", 1, 15, now, now.plusSeconds(1799)));
        assertEquals(now.plusSeconds(1800), original.createManualRepost("item", 1, 15, now, now.plusSeconds(1800)).getExpiresAt());
        OrderProblem missing = assertThrows(OrderProblem.class, () -> original.createManualRepost(null, 0, 14, now, null));
        assertEquals(4, missing.getDetails().size());
        Order active = Order.open("owner", "item", "p", "d", 1, 15, now, now.plusSeconds(3600));
        assertThrows(OrderProblem.class, () -> active.createManualRepost("item", 1, 15, now, now.plusSeconds(3600)));
    }

    @Test
    void disabledPlansIgnoreUnspecifiedDetailsAndDueNullDoesNotBlameExpiry() {
        assertNotNull(new RepostPlan(false, null, 0, 0, null));
        OrderProblem missing = assertThrows(OrderProblem.class, () -> new RepostPlan(true, null, 1, 15, now.plusSeconds(3600)));
        assertEquals("repostDueAt", missing.getDetails().getFirst().getField());
        assertEquals(1, missing.getDetails().size());
    }

    @Test
    void identicalSupplierIdsProduceOnlyDeliveryFieldError() {
        OrderProblem error = assertThrows(OrderProblem.class, () -> Order.open(
                "owner", "item", "same", "same", 1, 15, now, now.plusSeconds(3600)));
        assertEquals(1, error.getDetails().size());
        assertEquals("deliverySupplierId", error.getDetails().getFirst().getField());
        assertTrue(error.getDetails().getFirst().getMessage().contains("differ"));
        assertFalse(error.getMessage().contains("expiry"));
    }

    @Test
    void reportsEveryActualCreationErrorWithoutUnrelatedFields() {
        OrderProblem error = assertThrows(OrderProblem.class, () -> Order.open(
                "owner", "item", "pickup", "delivery", 0, 14, now, now.plusSeconds(1799)));
        assertEquals(java.util.Set.of("offeredCredits", "deliveryTimeLimitMinutes", "expiresAt"),
                error.getDetails().stream().map(OrderProblem.Detail::getField).collect(java.util.stream.Collectors.toSet()));
        assertNotNull(Order.open("owner", "item", "pickup", "delivery", 1, 15, now, now.plusSeconds(1800)));
    }

    @Test
    void newAutomaticPlanRejectsShortWindowAndAcceptsExactThirtyMinutes() {
        Instant due = now.plusSeconds(3600);
        OrderProblem error = assertThrows(OrderProblem.class,
                () -> new RepostPlan(true, due, 1, 15, due.plusSeconds(1799)));
        assertEquals("repostExpiresAt", error.getDetails().getFirst().getField());
        assertNotNull(new RepostPlan(true, due, 1, 15, due.plusSeconds(1800)));
    }

    @Test
    void hydratedLegacyPlanRemainsEligibleAndLateExecutionUsesSavedExpiry() {
        Instant due = now.plusSeconds(3600);
        Order original = Order.open("owner", "item", "pickup", "delivery", 1, 15, now, due);
        RepostPlan legacy = new RepostPlan(); // JPA hydration bypasses new-plan constructor.
        ReflectionTestUtils.setField(legacy, "enabled", true);
        ReflectionTestUtils.setField(legacy, "dueAt", due);
        ReflectionTestUtils.setField(legacy, "expiresAt", due.plusSeconds(900));
        ReflectionTestUtils.setField(legacy, "creditAmount", 1L);
        ReflectionTestUtils.setField(legacy, "deliveryDurationMinutes", 15);
        ReflectionTestUtils.setField(original, "repostPlan", legacy);
        original.expire(0, due);
        Instant late = due.plusSeconds(899);
        assertTrue(original.eligibleForAutomaticRepost(late));
        Order repost = original.createRepost("item", 1, 15, late, legacy.getExpiresAt());
        assertEquals(legacy.getExpiresAt(), repost.getExpiresAt());
        assertNotEquals(original.getId(), repost.getId());
        assertFalse(original.eligibleForAutomaticRepost(legacy.getExpiresAt()));
    }
}
