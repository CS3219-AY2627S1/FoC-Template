package com.friendoncampus.order.messaging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import com.friendoncampus.order.domain.Order;
import com.friendoncampus.order.domain.OrderDetails;
import com.friendoncampus.order.domain.OrderTransitionException;
import com.friendoncampus.order.domain.TerminalReason;
import com.friendoncampus.order.repository.OutboxEventRepository;
import com.friendoncampus.order.service.CreateOrderCommand;
import com.friendoncampus.order.service.OrderExpiredOnActionException;
import com.friendoncampus.order.service.OrderService;
import com.friendoncampus.order.support.MutableClock;
import com.networknt.schema.Error;
import com.networknt.schema.InputFormat;
import com.networknt.schema.Schema;
import com.networknt.schema.SchemaRegistry;
import com.networknt.schema.SpecificationVersion;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * {@code OrderTransitioned} for every committed transition, checked against the shared N2H contract
 * ({@code docs/contracts/n2h-events.schema.json}) on a real PostgreSQL. Requires Docker.
 */
@SpringBootTest(properties = {"app.orders.expiry.enabled=false", "app.kafka.enabled=false",
        "app.kafka.lifecycle-events.enabled=true"})
@Testcontainers
class OrderLifecycleEventIntegrationTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    private static final MutableClock CLOCK = new MutableClock(Instant.now());
    private static final UUID REQUESTER = UUID.fromString("97947588-bb2e-42f2-91ba-9abf8e15a8e7");
    private static final UUID ALICE = UUID.fromString("5b0f3c1e-8a52-4f8e-9d37-2c1b6e4a7f10");
    private static final UUID BOB = UUID.fromString("2d3c4b5a-6978-4f1e-8d2c-3b4a5f6e7d8c");
    private static final Path CONTRACT = Path.of("../docs/contracts/n2h-events.schema.json");

    private static Schema contract;

    @TestConfiguration
    static class TestClock {
        @Bean
        @Primary
        Clock testClock() {
            return CLOCK;
        }
    }

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @Autowired
    private OrderService orderService;

    @Autowired
    private OutboxEventRepository outboxEventRepository;

    @Autowired
    private JdbcTemplate jdbc;

    private final JsonMapper json = JsonMapper.builder().build();

    @BeforeAll
    static void loadContract() throws Exception {
        contract = SchemaRegistry.withDefaultDialect(SpecificationVersion.DRAFT_2020_12)
                .getSchema(Files.readString(CONTRACT), InputFormat.JSON);
    }

    @Test
    void theContractRejectsAnEventWithoutASourceSequence() {
        UUID orderId = submit(Duration.ofHours(1));
        ObjectNode event = (ObjectNode) lifecycle(orderId).get(0);
        ((ObjectNode) event.get("data")).remove("sourceSequence");

        assertThat(contract.validate(json.writeValueAsString(event), InputFormat.JSON)).isNotEmpty();
    }

    @BeforeEach
    void resetClock() {
        CLOCK.set(Instant.now().truncatedTo(ChronoUnit.MICROS));
    }

    private UUID submit(Duration untilDeadline) {
        OffsetDateTime deadline = OffsetDateTime.ofInstant(CLOCK.instant(), ZoneOffset.UTC).plus(untilDeadline);
        return orderService.createOrder(new CreateOrderCommand(REQUESTER, "Buy coffee", "Flat white",
                UUID.randomUUID(), "Library cafe", UUID.randomUUID(), "Block E lobby", 3, deadline)).getId();
    }

    private UUID open(Duration untilDeadline) {
        UUID orderId = submit(untilDeadline);
        orderService.confirmReservation(orderId, UUID.randomUUID());
        return orderId;
    }

    /** The order's OrderTransitioned events, oldest first; each must satisfy the shared schema. */
    private List<JsonNode> lifecycle(UUID orderId) {
        List<JsonNode> events = new ArrayList<>();
        for (OutboxEvent row : outboxEventRepository.findByAggregateIdOrderByAggregateVersionAsc(orderId)) {
            if (!row.getTopic().equals("order.lifecycle.events")) {
                continue;
            }
            assertThat(row.getEventType()).isEqualTo("OrderTransitioned");
            assertThat(row.getOperationId()).isNull();
            List<Error> errors = contract.validate(row.getPayload(), InputFormat.JSON);
            assertThat(errors).as(row.getPayload()).isEmpty();
            JsonNode event = json.readTree(row.getPayload());
            assertThat(event.get("eventId").asString()).isEqualTo(row.getId().toString());
            events.add(event);
        }
        return events;
    }

    private static List<Long> sequences(List<JsonNode> events) {
        return events.stream().map(event -> event.get("data").get("sourceSequence").asLong()).toList();
    }

    private static List<String> actions(List<JsonNode> events) {
        return events.stream().map(event -> event.get("data").get("action").asString()).toList();
    }

    private static JsonNode last(List<JsonNode> events) {
        return events.get(events.size() - 1);
    }

    @Test
    void aFullLifecyclePublishesOneValidEventPerTransitionNumberedFromOne() {
        UUID orderId = open(Duration.ofHours(1));
        orderService.accept(orderId, ALICE);
        orderService.pickUp(orderId, ALICE);
        orderService.deliver(orderId, ALICE);
        orderService.complete(orderId, REQUESTER);

        List<JsonNode> events = lifecycle(orderId);

        assertThat(actions(events)).containsExactly("SUBMIT", "OPEN", "ACCEPT", "PICK_UP", "DELIVER", "COMPLETE");
        assertThat(sequences(events)).containsExactly(1L, 2L, 3L, 4L, 5L, 6L);

        JsonNode submitted = events.get(0);
        assertThat(submitted.get("data").get("fromState").isNull()).isTrue();
        assertThat(submitted.get("data").get("toState").asString()).isEqualTo("PENDING_CREDIT");
        assertThat(submitted.get("actor").get("userId").asString()).isEqualTo(REQUESTER.toString());

        JsonNode completed = last(events);
        JsonNode data = completed.get("data");
        assertThat(data.get("fromState").asString()).isEqualTo("DELIVERED");
        assertThat(data.get("toState").asString()).isEqualTo("COMPLETED");
        assertThat(data.get("courierId").asString()).isEqualTo(ALICE.toString());
        assertThat(data.get("previousCourierId").isNull()).isTrue();
        assertThat(data.get("snapshot").get("status").asString()).isEqualTo("COMPLETED");
        assertThat(data.get("snapshot").get("title").asString()).isEqualTo("Buy coffee");
        assertThat(data.get("snapshot").get("pickupLocationName").asString()).isEqualTo("Library cafe");
        assertThat(completed.get("actor").get("role").asString()).isEqualTo("REQUESTER");

        // Every lifecycle event shares the order's correlation ID with its order.events requests.
        String correlationId = submitted.get("correlationId").asString();
        assertThat(events).allSatisfy(event -> assertThat(event.get("correlationId").asString())
                .isEqualTo(correlationId));
    }

    @Test
    void twoAcceptanceCyclesKeepDistinctNumbersAndNameTheWithdrawnCourier() {
        UUID orderId = open(Duration.ofHours(1));
        Order order = orderService.getOrder(orderId, REQUESTER);
        orderService.edit(orderId, REQUESTER, order.getVersion(), new OrderDetails("Buy two coffees", "Flat white",
                order.getPickupLocationId(), "Library cafe", order.getDropoffLocationId(), "Block E lobby", 3,
                order.getPickupDeadline()));
        orderService.accept(orderId, ALICE);
        orderService.withdraw(orderId, ALICE);
        orderService.accept(orderId, BOB);

        List<JsonNode> events = lifecycle(orderId);

        // The example in notification-service/DESIGN.md "sourceSequence".
        assertThat(actions(events)).containsExactly("SUBMIT", "OPEN", "EDIT", "ACCEPT", "WITHDRAW", "ACCEPT");
        assertThat(sequences(events)).containsExactly(1L, 2L, 3L, 4L, 5L, 6L);
        JsonNode edit = events.get(2).get("data");
        assertThat(edit.get("fromState").asString()).isEqualTo(edit.get("toState").asString());
        assertThat(edit.get("snapshot").get("title").asString()).isEqualTo("Buy two coffees");

        JsonNode withdrawn = events.get(4).get("data");
        assertThat(withdrawn.get("previousCourierId").asString()).isEqualTo(ALICE.toString());
        assertThat(withdrawn.get("courierId").isNull()).isTrue();
        assertThat(withdrawn.get("snapshot").get("courierId").isNull()).isTrue();
        assertThat(events.get(5).get("data").get("courierId").asString()).isEqualTo(BOB.toString());
    }

    @Test
    void cancellingAfterAcceptanceNamesTheCourierAndGivesTheReason() {
        UUID orderId = open(Duration.ofHours(1));
        orderService.accept(orderId, ALICE);
        orderService.cancel(orderId, REQUESTER);

        JsonNode data = last(lifecycle(orderId)).get("data");

        assertThat(data.get("action").asString()).isEqualTo("CANCEL");
        assertThat(data.get("previousCourierId").asString()).isEqualTo(ALICE.toString());
        assertThat(data.get("courierId").isNull()).isTrue();
        assertThat(data.get("reasonCode").asString()).isEqualTo("REQUESTER_CANCELLED_ACCEPTED");
    }

    @Test
    void rejectedRacedAndRepeatedRequestsTakeNoNumber() throws Exception {
        UUID orderId = open(Duration.ofHours(1));
        int couriers = 6;
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(couriers);
        try {
            List<Future<Void>> results = new ArrayList<>();
            for (int i = 0; i < couriers; i++) {
                UUID courier = UUID.randomUUID();
                results.add(pool.submit((Callable<Void>) () -> {
                    start.await();
                    try {
                        orderService.accept(orderId, courier);
                    } catch (OrderTransitionException lostTheRace) {
                        // Expected for all but one.
                    }
                    return null;
                }));
            }
            start.countDown();
            for (Future<Void> result : results) {
                result.get();
            }
        } finally {
            pool.shutdownNow();
        }
        UUID winner = orderService.getOrder(orderId, REQUESTER).getCourierId();
        orderService.accept(orderId, winner);
        // The requester can see the order but is not its courier: rejected, nothing changes.
        assertThatThrownBy(() -> orderService.pickUp(orderId, REQUESTER))
                .isInstanceOf(OrderTransitionException.class);

        List<JsonNode> events = lifecycle(orderId);

        assertThat(actions(events)).containsExactly("SUBMIT", "OPEN", "ACCEPT");
        assertThat(sequences(events)).containsExactly(1L, 2L, 3L);
        assertThat(jdbc.queryForObject("select lifecycle_sequence from orders where id = ?", Long.class, orderId))
                .isEqualTo(3L);
    }

    @Test
    void withdrawingAfterTheDeadlineExpiresAndStillNamesTheWithdrawnCourier() {
        UUID orderId = open(Duration.ofMinutes(5));
        orderService.accept(orderId, ALICE);
        CLOCK.advance(Duration.ofMinutes(6));
        orderService.withdraw(orderId, ALICE);

        JsonNode withdrawn = last(lifecycle(orderId));
        JsonNode data = withdrawn.get("data");

        assertThat(data.get("action").asString()).isEqualTo("WITHDRAW");
        assertThat(data.get("toState").asString()).isEqualTo("EXPIRED");
        assertThat(data.get("previousCourierId").asString()).isEqualTo(ALICE.toString());
        assertThat(data.get("courierId").isNull()).isTrue();
        assertThat(data.get("reasonCode").asString()).isEqualTo("COURIER_WITHDREW_AFTER_DEADLINE");
        assertThat(withdrawn.get("actor").get("userId").asString()).isEqualTo(ALICE.toString());
    }

    @Test
    void lazyExpiryPublishesTheExpiryAsTheSystemAndTheLateAcceptTakesNoNumber() {
        UUID orderId = open(Duration.ofMinutes(5));
        CLOCK.advance(Duration.ofMinutes(6));

        assertThatThrownBy(() -> orderService.accept(orderId, ALICE))
                .isInstanceOf(OrderExpiredOnActionException.class);

        List<JsonNode> events = lifecycle(orderId);
        assertThat(actions(events)).containsExactly("SUBMIT", "OPEN", "EXPIRE");
        assertThat(sequences(events)).containsExactly(1L, 2L, 3L);
        JsonNode expiry = last(events);
        assertThat(expiry.get("actor").get("type").asString()).isEqualTo("SYSTEM");
        assertThat(expiry.get("actor").has("userId")).isFalse();
        assertThat(expiry.get("data").get("reasonCode").asString()).isEqualTo("PICKUP_DEADLINE_PASSED");

        assertThatThrownBy(() -> orderService.accept(orderId, BOB)).isInstanceOf(OrderTransitionException.class);
        assertThat(sequences(lifecycle(orderId))).containsExactly(1L, 2L, 3L);
    }

    @Test
    void creditDrivenTransitionsCarryTheCausingCreditEvent() {
        UUID orderId = submit(Duration.ofHours(1));
        UUID creditReserved = UUID.randomUUID();
        orderService.confirmReservation(orderId, UUID.randomUUID(), creditReserved);
        UUID failedOrder = submit(Duration.ofHours(1));
        UUID creditRejected = UUID.randomUUID();
        orderService.rejectReservation(failedOrder, TerminalReason.INSUFFICIENT_CREDITS, creditRejected);

        JsonNode opened = last(lifecycle(orderId));
        assertThat(opened.get("causationId").asString()).isEqualTo(creditReserved.toString());
        assertThat(opened.get("actor").get("type").asString()).isEqualTo("SYSTEM");
        assertThat(lifecycle(orderId).get(0).get("causationId").isNull()).isTrue();

        JsonNode failed = last(lifecycle(failedOrder));
        assertThat(failed.get("causationId").asString()).isEqualTo(creditRejected.toString());
        assertThat(failed.get("data").get("toState").asString()).isEqualTo("RESERVATION_FAILED");
        assertThat(failed.get("data").get("reasonCode").asString()).isEqualTo("INSUFFICIENT_CREDITS");
    }

    @Test
    void creditRequestsAreUnchangedAndSeparate() {
        UUID orderId = open(Duration.ofHours(1));
        orderService.cancel(orderId, REQUESTER);

        List<OutboxEvent> credit = outboxEventRepository.findByAggregateIdOrderByAggregateVersionAsc(orderId).stream()
                .filter(row -> row.getTopic().equals("order.events"))
                .toList();

        assertThat(credit).extracting(OutboxEvent::getEventType).containsExactly("OrderSubmitted", "OrderCancelled");
        assertThat(credit).allSatisfy(row -> assertThat(row.getOperationId()).isNotNull());
        assertThat(lifecycle(orderId)).hasSize(3);
    }
    @Test
    void evidenceExportPinsTheOriginalPrefixAndRejectsMissingOrLegacyBaselines(){
        UUID orderId=open(Duration.ofHours(1));
        var exports=new com.friendoncampus.order.service.OrderEvidenceExportService(org.springframework.jdbc.core.simple.JdbcClient.create(jdbc));
        var first=exports.read(orderId,null,1);assertThat(first.checkpoint().committedSequence()).isEqualTo(2);
        orderService.accept(orderId,ALICE);
        var next=exports.read(orderId,first.nextCursor(),1);assertThat(next.checkpoint().committedSequence()).isEqualTo(2);assertThat(next.records().get(0).get("action")).isEqualTo("OPEN");
        assertThat(exports.read(orderId,null,100).checkpoint().committedSequence()).isEqualTo(3);
        String invalid=java.util.Base64.getUrlEncoder().withoutPadding().encodeToString("3:-1".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertThatThrownBy(()->exports.read(orderId,invalid,1)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        jdbc.update("DELETE FROM outbox_events WHERE aggregate_id=? AND topic='order.lifecycle.events' AND payload->'data'->>'action'='SUBMIT'",orderId);
        assertThatThrownBy(()->exports.read(orderId,null,100)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        UUID legacy=submit(Duration.ofHours(1));
        jdbc.update("UPDATE outbox_events SET payload=jsonb_set(payload,'{data,action}','\"EDIT\"') WHERE aggregate_id=? AND topic='order.lifecycle.events'",legacy);
        assertThatThrownBy(()->exports.read(legacy,null,100)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }
}
