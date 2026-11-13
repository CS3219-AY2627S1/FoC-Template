package sg.edu.nus.foc.order.domain;

import static org.junit.jupiter.api.Assertions.*;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class OrderAggregateTest {
    private final Instant start = Instant.parse("2026-09-30T00:00:00Z");
    @Test void requesterCreatesAndCourierCompletesLifecycle() {
        Order order = Order.open("requester", "books", "pickup", "delivery", 10, 30, start, start.plusSeconds(3600));
        order.accept("courier", 0, start.plusSeconds(60)); order.start("courier",0); order.markPickedUp("courier",0); order.markDelivered("courier",0); order.confirmCompletion("requester",0);
        assertEquals(OrderStatus.COMPLETED, order.getStatus());
    }
    @Test void requesterCannotAcceptOwnOrder() { Order order=Order.open("u","x","p","d",1,15,start,start.plusSeconds(1800)); assertThrows(OrderProblem.class,()->order.accept("u",0,start)); }
    @Test void expiryAndRepostAreExplicit() { Order order=Order.open("u","x","p","d",1,15,start,start.plusSeconds(1800),new RepostPlan(true,start.plusSeconds(1800),2,15, start.plusSeconds(1800).plusSeconds(3600))); order.expire(0,start.plusSeconds(1800)); assertTrue(order.eligibleForAutomaticRepost(start.plusSeconds(1801))); Order repost=order.createRepost("x",2,15,start.plusSeconds(1801),start.plusSeconds(3601)); order.linkRepost(repost.getId()); assertEquals(order.getId(),repost.getOriginalOrderId()); }
    @Test void repostConfigurationCannotBeChangedAfterCreation() { Order order=Order.open("u","x","p","d",1,15,start,start.plusSeconds(1800)); assertThrows(OrderProblem.class,()->order.configureReposting(new RepostPlan(true,start.plusSeconds(1800),2,15, start.plusSeconds(1800).plusSeconds(3600)),"u",0)); }
    @Test void staleVersionIsRejected() { Order order=Order.open("u","x","p","d",1,15,start,start.plusSeconds(1800)); assertThrows(OrderProblem.class,()->order.cancelOpen("u",1)); }
}
