package com.friendoncampus.order.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.data.domain.Page;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import com.friendoncampus.order.domain.Order;
import com.friendoncampus.order.domain.OrderState;
import com.friendoncampus.order.domain.TerminalReason;
import com.friendoncampus.order.support.MutableClock;

/**
 * The open-order pool (F4) and "my orders" history (F9) against a real PostgreSQL. Orders are
 * driven through {@link OrderService} so the stored rows look exactly like production ones.
 * Requires Docker.
 */
@SpringBootTest(properties = {"app.orders.expiry.enabled=false", "app.kafka.enabled=false"})
@Testcontainers
class OrderDiscoveryHistoryIntegrationTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    private static final UUID REQUESTER = UUID.fromString("97947588-bb2e-42f2-91ba-9abf8e15a8e7");
    private static final UUID OTHER_REQUESTER = UUID.fromString("5b0f8a3e-2c41-4d7a-9e6b-1f3c5a7d9e20");
    private static final UUID COURIER = UUID.fromString("0c6b2f7e-91a4-4d3b-8e5f-6a7b8c9d0e1f");
    private static final UUID OTHER_COURIER = UUID.fromString("e1d2c3b4-a596-4877-8695-a4b3c2d1e0f9");
    private static final MutableClock CLOCK = new MutableClock(Instant.now());

    @TestConfiguration
    static class TestClock {
        @Bean
        @Primary
        MutableClock testClock() {
            return CLOCK;
        }
    }

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @Autowired
    private OrderService orderService;

    @Autowired
    private OrderQueryService queryService;

    @Autowired
    private JdbcTemplate jdbc;

    @BeforeEach
    void reset() {
        jdbc.execute("TRUNCATE outbox_events, order_transitions, processed_events, orders");
        CLOCK.set(Instant.now().truncatedTo(ChronoUnit.MICROS).plusNanos(700));
    }

    private OffsetDateTime now() {
        return OffsetDateTime.ofInstant(CLOCK.instant(), ZoneOffset.UTC);
    }

    private UUID createOrder(UUID requester, String pickupName, UUID pickupId, UUID dropoffId, int reward,
            Duration untilDeadline) {
        return orderService.createOrder(new CreateOrderCommand(requester, "Collect printing", "Grab my printout",
                pickupId, pickupName, dropoffId, "UTown Residence", reward, now().plus(untilDeadline))).getId();
    }

    private UUID open(UUID requester, String pickupName, UUID pickupId, UUID dropoffId, int reward,
            Duration untilDeadline) {
        UUID id = createOrder(requester, pickupName, pickupId, dropoffId, reward, untilDeadline);
        orderService.confirmReservation(id, UUID.randomUUID());
        return id;
    }

    private UUID open(int reward, Duration untilDeadline) {
        return open(REQUESTER, "COM1 Print Shop", UUID.randomUUID(), UUID.randomUUID(), reward, untilDeadline);
    }

    private UUID completedBy(UUID requester, UUID courier) {
        UUID id = open(requester, "COM1 Print Shop", UUID.randomUUID(), UUID.randomUUID(), 10, Duration.ofHours(1));
        orderService.accept(id, courier);
        orderService.pickUp(id, courier);
        orderService.deliver(id, courier);
        orderService.complete(id, requester);
        return id;
    }

    private Page<Order> pool(UUID caller, String minReward, String maxReward, String pickup, String dropoff,
            String sort, String page, String size) {
        return queryService.findOpenPool(caller,
                OrderPoolQuery.from(minReward, maxReward, pickup, dropoff, sort, page, size));
    }

    private Page<Order> pool(UUID caller, String sort) {
        return pool(caller, null, null, null, null, sort, null, null);
    }

    private static List<UUID> ids(Page<Order> page) {
        return page.getContent().stream().map(Order::getId).toList();
    }

    /** PostgreSQL orders UUIDs by unsigned bytes, which matches their lowercase text form. */
    private static List<UUID> byId(UUID... ids) {
        return List.of(ids).stream().sorted(Comparator.comparing(UUID::toString)).toList();
    }

    @Test
    void poolShowsOnlyOpenFutureOrdersWithoutPendingChangesFromOtherRequesters() {
        UUID available = open(10, Duration.ofHours(2));
        UUID overdue = open(10, Duration.ofMinutes(5));
        UUID pendingCredit = createOrder(REQUESTER, "COM1", UUID.randomUUID(), UUID.randomUUID(), 10,
                Duration.ofHours(2));
        UUID failed = createOrder(REQUESTER, "COM1", UUID.randomUUID(), UUID.randomUUID(), 10, Duration.ofHours(2));
        orderService.rejectReservation(failed, TerminalReason.INSUFFICIENT_CREDITS);
        UUID accepted = open(10, Duration.ofHours(2));
        orderService.accept(accepted, OTHER_COURIER);
        UUID cancelled = open(10, Duration.ofHours(2));
        orderService.cancel(cancelled, REQUESTER);
        UUID rewardChangePending = open(10, Duration.ofHours(2));
        jdbc.update("update orders set pending_credit_reward = 15 where id = ?", rewardChangePending);
        UUID ownRequest = open(COURIER, "COM1", UUID.randomUUID(), UUID.randomUUID(), 10, Duration.ofHours(2));

        // Still OPEN in the database, but its deadline has been reached: not offered.
        CLOCK.advance(Duration.ofMinutes(5));
        Page<Order> page = pool(COURIER, null);

        assertThat(ids(page)).containsExactly(available);
        assertThat(page.getTotalElements()).isEqualTo(1);
        assertThat(orderService.getOrder(overdue, REQUESTER).getState()).isEqualTo(OrderState.OPEN);
        assertThat(ids(page)).doesNotContain(overdue, pendingCredit, failed, accepted, cancelled,
                rewardChangePending, ownRequest);
        // The requester of everything else sees the courier's own request, but never their own.
        assertThat(ids(pool(REQUESTER, null))).containsExactly(ownRequest);
    }

    @Test
    void filtersByRewardRangeAndLocations() {
        UUID library = UUID.randomUUID();
        UUID hall = UUID.randomUUID();
        UUID five = open(REQUESTER, "Library", library, hall, 5, Duration.ofHours(1));
        UUID ten = open(REQUESTER, "Library", library, UUID.randomUUID(), 10, Duration.ofHours(2));
        UUID twenty = open(REQUESTER, "Canteen", UUID.randomUUID(), hall, 20, Duration.ofHours(3));

        assertThat(ids(pool(COURIER, "10", null, null, null, null, null, null))).containsExactly(ten, twenty);
        assertThat(ids(pool(COURIER, null, "10", null, null, null, null, null))).containsExactly(five, ten);
        assertThat(ids(pool(COURIER, "10", "10", null, null, null, null, null))).containsExactly(ten);
        assertThat(ids(pool(COURIER, null, null, library.toString(), null, null, null, null)))
                .containsExactly(five, ten);
        assertThat(ids(pool(COURIER, null, null, null, hall.toString(), null, null, null)))
                .containsExactly(five, twenty);
        assertThat(ids(pool(COURIER, "6", null, library.toString(), null, null, null, null))).containsExactly(ten);
        assertThat(ids(pool(COURIER, null, null, library.toString(), hall.toString(), null, null, null)))
                .containsExactly(five);
    }

    @Test
    void noMatchesIsAnEmptyPage() {
        open(10, Duration.ofHours(1));

        Page<Order> page = pool(COURIER, "50", null, null, null, null, null, null);

        assertThat(page.getContent()).isEmpty();
        assertThat(page.getTotalElements()).isZero();
        assertThat(page.getTotalPages()).isZero();
    }

    @Test
    void sortsByDeadlineByDefaultWithIdAsTiebreak() {
        UUID later = open(10, Duration.ofHours(3));
        UUID soonest = open(10, Duration.ofHours(1));
        // Same clock instant, so the same deadline: id decides.
        UUID tieA = open(10, Duration.ofHours(2));
        UUID tieB = open(10, Duration.ofHours(2));
        List<UUID> tie = byId(tieA, tieB);

        assertThat(ids(pool(COURIER, null))).containsExactly(soonest, tie.get(0), tie.get(1), later);
        assertThat(ids(pool(COURIER, "deadline"))).containsExactly(soonest, tie.get(0), tie.get(1), later);
    }

    @Test
    void sortsByHighestRewardThenDeadlineThenId() {
        UUID low = open(5, Duration.ofHours(1));
        UUID highLater = open(30, Duration.ofHours(3));
        UUID highSooner = open(30, Duration.ofHours(2));
        UUID midA = open(10, Duration.ofHours(2));
        UUID midB = open(10, Duration.ofHours(2));
        List<UUID> mid = byId(midA, midB);

        assertThat(ids(pool(COURIER, "reward")))
                .containsExactly(highSooner, highLater, mid.get(0), mid.get(1), low);
    }

    @Test
    void sortsByPickupLocationNameIgnoringCase() {
        UUID charlie = open(REQUESTER, "charlie", UUID.randomUUID(), UUID.randomUUID(), 10, Duration.ofHours(1));
        UUID bravo = open(REQUESTER, "Bravo", UUID.randomUUID(), UUID.randomUUID(), 10, Duration.ofHours(1));
        UUID alpha = open(REQUESTER, "alpha", UUID.randomUUID(), UUID.randomUUID(), 10, Duration.ofHours(2));
        UUID alphaSooner = open(REQUESTER, "ALPHA", UUID.randomUUID(), UUID.randomUUID(), 10, Duration.ofHours(1));
        UUID unnamed = open(REQUESTER, "zulu", UUID.randomUUID(), UUID.randomUUID(), 10, Duration.ofHours(1));
        // Orders created before location names were stored have none; they sort last.
        jdbc.update("update orders set pickup_location_name_snapshot = null where id = ?", unnamed);

        assertThat(ids(pool(COURIER, "pickupLocationName")))
                .containsExactly(alphaSooner, alpha, bravo, charlie, unnamed);
    }

    @Test
    void pagesThroughThePoolWithTotals() {
        UUID first = open(10, Duration.ofHours(1));
        UUID second = open(10, Duration.ofHours(2));
        UUID third = open(10, Duration.ofHours(3));

        Page<Order> page0 = pool(COURIER, null, null, null, null, null, "0", "2");
        Page<Order> page1 = pool(COURIER, null, null, null, null, null, "1", "2");
        Page<Order> page2 = pool(COURIER, null, null, null, null, null, "2", "2");

        assertThat(ids(page0)).containsExactly(first, second);
        assertThat(ids(page1)).containsExactly(third);
        assertThat(page2.getContent()).isEmpty();
        assertThat(page0.getTotalElements()).isEqualTo(3);
        assertThat(page0.getTotalPages()).isEqualTo(2);
        assertThat(page1.getNumber()).isEqualTo(1);
        assertThat(page1.getSize()).isEqualTo(2);
    }

    @Test
    void requesterHistoryHasOnlyTheirFinishedOrdersNewestFirst() {
        UUID open = open(10, Duration.ofHours(1));
        UUID failed = createOrder(REQUESTER, "COM1", UUID.randomUUID(), UUID.randomUUID(), 10, Duration.ofHours(1));
        orderService.rejectReservation(failed, TerminalReason.INSUFFICIENT_CREDITS);
        UUID pending = createOrder(REQUESTER, "COM1", UUID.randomUUID(), UUID.randomUUID(), 10, Duration.ofHours(1));
        UUID accepted = open(10, Duration.ofHours(1));
        orderService.accept(accepted, COURIER);

        UUID expired = open(10, Duration.ofMinutes(5));
        CLOCK.advance(Duration.ofMinutes(5));
        orderService.expireIfStillOverdue(expired);
        CLOCK.advance(Duration.ofSeconds(1));
        UUID cancelled = open(10, Duration.ofHours(1));
        orderService.cancel(cancelled, REQUESTER);
        CLOCK.advance(Duration.ofSeconds(1));
        UUID completed = completedBy(REQUESTER, COURIER);
        CLOCK.advance(Duration.ofSeconds(1));
        UUID someoneElses = completedBy(OTHER_REQUESTER, COURIER);

        Page<Order> history = queryService.findRequested(REQUESTER, MyOrdersFilter.PAST, OrderPaging.from(null, null));

        assertThat(ids(history)).containsExactly(completed, cancelled, expired);
        assertThat(ids(history)).doesNotContain(open, failed, pending, accepted, someoneElses);
        assertThat(history.getTotalElements()).isEqualTo(3);

        Page<Order> firstPage = queryService.findRequested(REQUESTER, MyOrdersFilter.PAST, OrderPaging.from("0", "2"));
        assertThat(ids(firstPage)).containsExactly(completed, cancelled);
        assertThat(firstPage.getTotalPages()).isEqualTo(2);
        assertThat(ids(queryService.findRequested(OTHER_REQUESTER, MyOrdersFilter.PAST, OrderPaging.from(null, null))))
                .containsExactly(someoneElses);
    }

    @Test
    void courierHistoryHasOnlyCompletedOrdersTheyDelivered() {
        UUID older = completedBy(REQUESTER, COURIER);
        CLOCK.advance(Duration.ofSeconds(1));
        UUID newer = completedBy(OTHER_REQUESTER, COURIER);
        UUID byOtherCourier = completedBy(REQUESTER, OTHER_COURIER);
        UUID inProgress = open(10, Duration.ofHours(1));
        orderService.accept(inProgress, COURIER);
        orderService.pickUp(inProgress, COURIER);
        orderService.deliver(inProgress, COURIER);
        UUID cancelledAfterAccept = open(10, Duration.ofHours(1));
        orderService.accept(cancelledAfterAccept, COURIER);
        orderService.cancel(cancelledAfterAccept, REQUESTER);

        Page<Order> history = queryService.findDelivered(COURIER, MyOrdersFilter.PAST, OrderPaging.from(null, null));

        assertThat(ids(history)).containsExactly(newer, older);
        assertThat(ids(history)).doesNotContain(byOtherCourier, inProgress, cancelledAfterAccept);
        assertThat(ids(queryService.findDelivered(OTHER_COURIER, MyOrdersFilter.PAST, OrderPaging.from(null, null))))
                .containsExactly(byOtherCourier);
        // A requester is never a courier of their own order, so their delivered list is empty.
        assertThat(queryService.findDelivered(REQUESTER, MyOrdersFilter.PAST, OrderPaging.from(null, null)).getContent())
                .isEmpty();
    }

    @Test
    void requesterActiveListHasTheirInProgressOrdersSoonestDeadlineFirst() {
        UUID later = open(10, Duration.ofHours(3));
        UUID pending = createOrder(REQUESTER, "COM1", UUID.randomUUID(), UUID.randomUUID(), 10, Duration.ofHours(2));
        UUID soonest = open(10, Duration.ofHours(1));
        orderService.accept(soonest, COURIER);
        UUID failed = createOrder(REQUESTER, "COM1", UUID.randomUUID(), UUID.randomUUID(), 10, Duration.ofMinutes(30));
        orderService.rejectReservation(failed, TerminalReason.INSUFFICIENT_CREDITS);
        UUID cancelled = open(10, Duration.ofMinutes(20));
        orderService.cancel(cancelled, REQUESTER);
        UUID someoneElses = open(OTHER_REQUESTER, "COM1", UUID.randomUUID(), UUID.randomUUID(), 10, Duration.ofMinutes(10));

        MyOrdersFilter active = MyOrdersFilter.from("active", null);
        assertThat(ids(queryService.findRequested(REQUESTER, active, OrderPaging.from(null, null))))
                .containsExactly(soonest, pending, later);
        assertThat(ids(queryService.findRequested(REQUESTER, MyOrdersFilter.from("active", "OPEN"),
                OrderPaging.from(null, null)))).containsExactly(later);
        assertThat(ids(queryService.findRequested(REQUESTER, active, OrderPaging.from(null, null))))
                .doesNotContain(failed, cancelled, someoneElses);
    }

    @Test
    void pastListCanBeNarrowedToOneFinishedState() {
        UUID cancelled = open(10, Duration.ofHours(1));
        orderService.cancel(cancelled, REQUESTER);
        UUID completed = completedBy(REQUESTER, COURIER);

        assertThat(ids(queryService.findRequested(REQUESTER, MyOrdersFilter.from("past", "CANCELLED"),
                OrderPaging.from(null, null)))).containsExactly(cancelled);
        assertThat(ids(queryService.findRequested(REQUESTER, MyOrdersFilter.from(null, "COMPLETED"),
                OrderPaging.from(null, null)))).containsExactly(completed);
        assertThatThrownBy(() -> queryService.findRequested(REQUESTER, MyOrdersFilter.from("past", "OPEN"),
                OrderPaging.from(null, null))).isInstanceOf(InvalidOrderQueryException.class);
        assertThatThrownBy(() -> queryService.findRequested(REQUESTER,
                MyOrdersFilter.from("past", "RESERVATION_FAILED"), OrderPaging.from(null, null)))
                .isInstanceOf(InvalidOrderQueryException.class);
    }

    @Test
    void courierActiveListHasErrandsStillAssignedToThem() {
        UUID accepted = open(10, Duration.ofHours(3));
        orderService.accept(accepted, COURIER);
        UUID pickedUp = open(10, Duration.ofHours(2));
        orderService.accept(pickedUp, COURIER);
        orderService.pickUp(pickedUp, COURIER);
        UUID delivered = open(10, Duration.ofHours(1));
        orderService.accept(delivered, COURIER);
        orderService.pickUp(delivered, COURIER);
        orderService.deliver(delivered, COURIER);
        UUID withdrawn = open(10, Duration.ofMinutes(50));
        orderService.accept(withdrawn, COURIER);
        orderService.withdraw(withdrawn, COURIER);
        UUID completed = completedBy(REQUESTER, COURIER);
        UUID otherCouriers = open(10, Duration.ofMinutes(40));
        orderService.accept(otherCouriers, OTHER_COURIER);

        assertThat(ids(queryService.findDelivered(COURIER, MyOrdersFilter.from("active", null),
                OrderPaging.from(null, null)))).containsExactly(delivered, pickedUp, accepted);
        assertThat(ids(queryService.findDelivered(COURIER, MyOrdersFilter.from("active", null),
                OrderPaging.from(null, null)))).doesNotContain(withdrawn, completed, otherCouriers);
    }
}
