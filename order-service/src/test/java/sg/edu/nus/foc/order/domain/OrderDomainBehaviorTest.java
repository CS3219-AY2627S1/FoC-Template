package sg.edu.nus.foc.order.domain;

import static org.junit.jupiter.api.Assertions.*;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mapstruct.factory.Mappers;
import org.springframework.test.util.ReflectionTestUtils;
import sg.edu.nus.foc.order.api.dto.response.OrderPageResponse;
import sg.edu.nus.foc.order.api.dto.response.OrderResponse;
import sg.edu.nus.foc.order.api.mapper.OrderMapper;
import sg.edu.nus.foc.order.domain.repository.OrderPage;

class OrderDomainBehaviorTest {
    private static final Instant START = Instant.parse("2026-09-30T00:00:00Z");

    @Test
    void repostPlanExposesStateAndDueBehavior() {
        RepostPlan disabled = new RepostPlan(false, null, 0, 0, null);
        assertFalse(disabled.isEnabled());
        assertNull(disabled.getDueAt());
        assertEquals(0, disabled.getCreditAmount());
        assertEquals(0, disabled.getDeliveryDurationMinutes());
        assertFalse(disabled.isUsed());
        assertFalse(disabled.isDueAt(START));

        RepostPlan enabled = new RepostPlan(true, START.plusSeconds(60), 4, 20, START.plusSeconds(60).plusSeconds(3600));
        assertTrue(enabled.isEnabled());
        assertFalse(enabled.isDueAt(START));
        assertTrue(enabled.isDueAt(START.plusSeconds(60)));
        enabled.markUsed();
        assertTrue(enabled.isUsed());
    }

    @Test
    void invalidRepostPlansAreRejected() {
        assertAll(
            () -> assertThrows(OrderProblem.class, () -> new RepostPlan(true, null, 1, 15, null)),
            () -> assertThrows(OrderProblem.class, () -> new RepostPlan(true, START, 0, 15, START.plusSeconds(3600))),
            () -> assertThrows(OrderProblem.class, () -> new RepostPlan(true, START, 1, 14, START.plusSeconds(3600)))
        );
    }

    @Test
    void invalidOrderCreationDataIsRejected() {
        assertAll(
            () -> assertThrows(OrderProblem.class, () -> Order.open("", "item", "p", "d", 1, 15, START, START.plusSeconds(1800))),
            () -> assertThrows(OrderProblem.class, () -> Order.open("u", "", "p", "d", 1, 15, START, START.plusSeconds(1800))),
            () -> assertThrows(OrderProblem.class, () -> Order.open("u", "item", "p", "p", 1, 15, START, START.plusSeconds(1800))),
            () -> assertThrows(OrderProblem.class, () -> Order.open("u", "item", "p", "d", 0, 15, START, START.plusSeconds(1800))),
            () -> assertThrows(OrderProblem.class, () -> Order.open("u", "item", "p", "d", 1, 14, START, START.plusSeconds(1800))),
            () -> assertThrows(OrderProblem.class, () -> Order.open("u", "item", "p", "d", 1, 15, START, null)),
            () -> assertThrows(OrderProblem.class, () -> Order.open("u", "item", "p", "d", 1, 15, START, START.plusSeconds(10))),
            () -> assertThrows(OrderProblem.class, () -> Order.open("u", "item", "p", "d", 1, 15, START, START))
        );
    }

    @Test
    void lifecycleRejectsWrongActorsStatesVersionsAndTimes() {
        Order order = Order.open("requester", "item", "p", "d", 2, 15, START, START.plusSeconds(1800));
        assertAll(
            () -> assertThrows(OrderProblem.class, () -> order.accept("courier", 1, START)),
            () -> assertThrows(OrderProblem.class, () -> order.accept("", 0, START)),
            () -> assertThrows(OrderProblem.class, () -> order.accept(null, 0, START)),
            () -> assertThrows(OrderProblem.class, () -> order.accept("courier", 0, START.plusSeconds(1800))),
            () -> assertThrows(OrderProblem.class, () -> order.accept("requester", 0, START)),
            () -> assertThrows(OrderProblem.class, () -> order.start("courier", 0)),
            () -> assertThrows(OrderProblem.class, () -> order.confirmCompletion("requester", 0)),
            () -> assertThrows(OrderProblem.class, () -> order.cancelOpen("other", 0))
        );

        order.accept("courier", 0, START.plusSeconds(1));
        assertAll(
            () -> assertThrows(OrderProblem.class, () -> order.accept("another", 0, START)),
            () -> assertThrows(OrderProblem.class, () -> order.start("another", 0)),
            () -> assertThrows(OrderProblem.class, () -> order.start("courier", 1)),
            () -> assertThrows(OrderProblem.class, () -> order.markPickedUp("courier", 0)),
            () -> assertThrows(OrderProblem.class, () -> order.cancelOpen("requester", 0))
        );
    }

    @Test
    void acceptanceRequiresAnUnassignedOrder() {
        Order order = Order.open("requester", "item", "p", "d", 2, 15, START, START.plusSeconds(1800));
        ReflectionTestUtils.setField(order, "courierId", "previous-courier");

        OrderProblem problem = assertThrows(OrderProblem.class,
                () -> order.accept("new-courier", 0, START.plusSeconds(1)));

        assertEquals("CONFLICT", problem.getCode());
        assertEquals(OrderStatus.OPEN, order.getStatus());
        assertEquals("previous-courier", order.getCourierId());
    }

    @Test
    void acceptedCancellationIsLimitedToTheAssignedCourier() {
        Order order = Order.open("requester", "item", "p", "d", 2, 15, START, START.plusSeconds(1800));
        order.accept("courier", 0, START.plusSeconds(1));

        assertAll(
                () -> assertThrows(OrderProblem.class, () -> order.validateAcceptedCancellation("requester", 0)),
                () -> assertThrows(OrderProblem.class, () -> order.validateAcceptedCancellation("other-courier", 0)));

        order.reopenAfterAcceptedCancellation("courier", 0, START.plusSeconds(2));

        assertEquals(OrderStatus.OPEN, order.getStatus());
        assertNull(order.getCourierId());
    }

    @Test
    void acceptedCancellationAtExpiryMustAbortInsteadOfReopening() {
        Instant expiresAt = START.plusSeconds(1800);
        Order order = Order.open("requester", "item", "p", "d", 2, 15, START, expiresAt);
        order.accept("courier", 0, START.plusSeconds(1));

        OrderProblem reopenProblem = assertThrows(OrderProblem.class,
                () -> order.reopenAfterAcceptedCancellation("courier", 0, expiresAt));
        assertEquals("CONFLICT", reopenProblem.getCode());
        assertEquals(OrderStatus.ACCEPTED, order.getStatus());
        assertEquals("courier", order.getCourierId());

        order.abortAfterAcceptedCancellation("courier", 0, expiresAt);
        assertEquals(OrderStatus.EXPIRED, order.getStatus());
        assertNull(order.getCourierId());
    }

    @Test
    void courierMustOwnTheAssignmentForEveryProgressTransition() {
        Order order = Order.open("requester", "item", "p", "d", 2, 15, START, START.plusSeconds(1800));
        order.accept("courier", 0, START.plusSeconds(1));

        assertThrows(OrderProblem.class, () -> order.start("other-courier", 0));
        order.start("courier", 0);
        assertThrows(OrderProblem.class, () -> order.markPickedUp("other-courier", 0));
        order.markPickedUp("courier", 0);
        assertThrows(OrderProblem.class, () -> order.markDelivered("other-courier", 0));
        order.markDelivered("courier", 0);

        assertEquals(OrderStatus.DELIVERED, order.getStatus());
        assertThrows(OrderProblem.class, () -> order.confirmCompletion("another-requester", 0));
        assertEquals(OrderStatus.DELIVERED, order.getStatus());
        order.confirmCompletion("requester", 0);
        assertEquals(OrderStatus.COMPLETED, order.getStatus());
    }

    @Test
    void cancellationExpiryAndRepostEligibilityRejectInvalidOperations() {
        Order order = Order.open("requester", "item", "p", "d", 2, 15, START, START.plusSeconds(1800));
        assertThrows(OrderProblem.class, () -> order.expire(0, START.plusSeconds(1)));
        order.expire(0, START.plusSeconds(1800));
        assertFalse(order.eligibleForAutomaticRepost(START.plusSeconds(1800)));
        assertThrows(OrderProblem.class, () -> order.expire(0, START.plusSeconds(1801)));

        Order repost = order.createRepost("item", 1, 15, START, START.plusSeconds(1800));
        assertEquals(order.getId(), repost.getOriginalOrderId());
        order.linkRepost("repost");
        assertThrows(OrderProblem.class, () -> order.createRepost("item", 1, 15, START, START.plusSeconds(1800)));
        assertThrows(OrderProblem.class, () -> order.linkRepost("second"));
    }

    @Test
    void gettersAndValueObjectsExposePersistedFields() {
        RepostPlan plan = new RepostPlan(true, START.plusSeconds(1800), 3, 20, START.plusSeconds(1800).plusSeconds(3600));
        Order order = Order.open("requester", "item", "p", "d", 2, 15, START, START.plusSeconds(1800), plan);
        assertNotNull(order.getId());
        assertEquals("requester", order.getRequesterId());
        assertNull(order.getCourierId());
        assertEquals("item", order.getItemDescription());
        assertEquals("p", order.getPickupSupplierId());
        assertEquals("d", order.getDeliverySupplierId());
        assertEquals(2, order.getOfferedCredits());
        assertEquals(OrderStatus.OPEN, order.getStatus());
        assertEquals(START, order.getCreatedAt());
        assertEquals(START.plusSeconds(1800), order.getExpiresAt());
        assertEquals(15, order.getDeliveryTimeLimitMinutes());
        assertEquals(0, order.getVersion());
        assertNull(order.getOriginalOrderId());
        assertNull(order.getRepostedOrderId());
        assertSame(plan, order.getRepostPlan());

        OrderCheckpoint checkpoint = new OrderCheckpoint(order.getId(), OrderStatus.OPEN, START, "requester", "p");
        assertNotNull(checkpoint.getId());
        assertEquals(order.getId(), checkpoint.getOrderId());
        assertEquals(OrderStatus.OPEN, checkpoint.getStatus());
        assertEquals(START, checkpoint.getOccurredAt());
        assertEquals("requester", checkpoint.getActorId());
        assertEquals("p", checkpoint.getSupplierId());

        CommandReceipt receipt = new CommandReceipt("CREATE", "command", order.getId(), START);
        assertEquals(order.getId(), receipt.getOrderId());

        OrderProblem problem = new OrderProblem("VALIDATION_ERROR", "bad", List.of(new OrderProblem.Detail("field", "message")));
        assertEquals("VALIDATION_ERROR", problem.getCode());
        assertEquals("bad", problem.getMessage());
        assertEquals(List.of(new OrderProblem.Detail("field", "message")), problem.getDetails());
        assertEquals("CONFLICT", OrderProblem.conflict("x").getCode());
        assertEquals("FORBIDDEN", OrderProblem.forbidden("x").getCode());
        assertEquals("NOT_FOUND", OrderProblem.notFound("x").getCode());
    }

    @Test
    void dtoViewsAndPagesMapOrders() {
        OrderMapper mapper = Mappers.getMapper(OrderMapper.class);
        Order order = Order.open("requester", "item", "p", "d", 2, 15, START, START.plusSeconds(1800),
                new RepostPlan(true, START.plusSeconds(2400), 3, 20, START.plusSeconds(2400).plusSeconds(3600)));
        OrderResponse view = mapper.toResponse(order);
        assertEquals(order.getId(), view.getId());
        assertTrue(view.isAutomaticRepostEnabled());
        assertEquals(3, view.getRepostCreditAmount());
        assertEquals(20, view.getRepostDeliveryDurationMinutes());

        OrderPageResponse page = mapper.toResponse(
                new OrderPage(List.of(order), 1, 1, 3, 3));
        assertEquals(1, page.getItems().size());
        assertEquals(view.getId(), page.getItems().getFirst().getId());
        assertEquals(2, page.getPage());
        assertEquals(1, page.getSize());
        assertEquals(3, page.getTotalItems());
        assertEquals(3, page.getTotalPages());
    }
}
