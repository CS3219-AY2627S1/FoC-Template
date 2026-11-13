package com.friendoncampus.order.messaging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import com.friendoncampus.order.domain.CreditStatus;
import com.friendoncampus.order.domain.Order;
import com.friendoncampus.order.domain.OrderState;
import com.friendoncampus.order.domain.TerminalReason;
import com.friendoncampus.order.messaging.CreditOutcomeHandler.Outcome;
import com.friendoncampus.order.repository.OutboxEventRepository;
import com.friendoncampus.order.service.CreateOrderCommand;
import com.friendoncampus.order.service.OrderService;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Credit outcome events shaped exactly as the event communication blueprint defines them, applied
 * against a real PostgreSQL. Requires Docker.
 */
@SpringBootTest(properties = {"app.orders.expiry.enabled=false", "app.kafka.enabled=false"})
@Testcontainers
class CreditOutcomeHandlerIntegrationTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    private static final UUID REQUESTER = UUID.fromString("97947588-bb2e-42f2-91ba-9abf8e15a8e7");
    private static final UUID COURIER = UUID.fromString("5b0f3c1e-8a52-4f8e-9d37-2c1b6e4a7f10");

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @Autowired
    private CreditOutcomeHandler handler;

    @Autowired
    private OrderService orderService;

    @Autowired
    private OutboxEventRepository outboxEventRepository;

    @Autowired
    private JdbcTemplate jdbc;

    private final JsonMapper json = JsonMapper.builder().build();

    private UUID createOrder() {
        return orderService.createOrder(new CreateOrderCommand(REQUESTER, "Collect printing", "Grab my printout",
                UUID.randomUUID(), "COM1 Print Shop", UUID.randomUUID(), "UTown Residence", 10, OffsetDateTime.now(ZoneOffset.UTC).plusHours(1))).getId();
    }

    /** The outbox event Order published for this order with the given type. */
    private JsonNode published(UUID orderId, String eventType) {
        OutboxEvent event = outboxEventRepository.findByAggregateIdOrderByAggregateVersionAsc(orderId).stream()
                .filter(candidate -> candidate.getEventType().equals(eventType))
                .findFirst()
                .orElseThrow();
        return json.readTree(event.getPayload());
    }

    /** A Credit outcome answering {@code command}, as the blueprint specifies. */
    private String outcome(JsonNode command, String eventType, Map<String, Object> extraData) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("operationId", command.get("data").get("operationId").asString());
        data.put("orderId", command.get("aggregateId").asString());
        data.putAll(extraData);
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("eventId", UUID.randomUUID().toString());
        envelope.put("eventType", eventType);
        envelope.put("eventVersion", 1);
        envelope.put("aggregateType", "Order");
        envelope.put("aggregateId", command.get("aggregateId").asString());
        envelope.put("aggregateVersion", command.get("aggregateVersion").asLong());
        envelope.put("occurredAt", "2026-10-17T10:00:00Z");
        envelope.put("producer", "credit-service");
        envelope.put("correlationId", command.get("correlationId").asString());
        envelope.put("causationId", command.get("eventId").asString());
        envelope.put("actor", Map.of("type", "SYSTEM"));
        envelope.put("data", data);
        return json.writeValueAsString(envelope);
    }

    private String reserved(JsonNode submitted, UUID reservationId) {
        return outcome(submitted, "CreditReserved", Map.of("reservationId", reservationId.toString(),
                "amount", 10, "availableBalance", 0, "reservedBalance", 10));
    }

    private Order order(UUID orderId) {
        return orderService.getOrder(orderId, REQUESTER);
    }

    @Test
    void creditReservedOpensTheOrderAndStoresTheReservation() {
        UUID orderId = createOrder();
        UUID reservationId = UUID.randomUUID();

        assertThat(handler.handle(reserved(published(orderId, "OrderSubmitted"), reservationId)))
                .isEqualTo(Outcome.APPLIED);

        Order order = order(orderId);
        assertThat(order.getState()).isEqualTo(OrderState.OPEN);
        assertThat(order.getCreditReservationId()).isEqualTo(reservationId);
        assertThat(order.getCreditStatus()).isEqualTo(CreditStatus.RESERVED);
    }

    @Test
    void aRedeliveredEventIsADuplicateAndChangesNothing() {
        UUID orderId = createOrder();
        String event = reserved(published(orderId, "OrderSubmitted"), UUID.randomUUID());

        handler.handle(event);
        long version = order(orderId).getVersion();

        assertThat(handler.handle(event)).isEqualTo(Outcome.DUPLICATE);
        assertThat(order(orderId).getVersion()).isEqualTo(version);
        assertThat(jdbc.queryForObject("select count(*) from processed_events where aggregate_id = ?",
                Integer.class, orderId)).isEqualTo(1);
    }

    @Test
    void anEventIdReusedWithDifferentContentIsRejected() {
        UUID orderId = createOrder();
        JsonNode submitted = published(orderId, "OrderSubmitted");
        String first = reserved(submitted, UUID.randomUUID());
        handler.handle(first);
        String eventId = json.readTree(first).get("eventId").asString();
        String tampered = first.replace("\"amount\":10", "\"amount\":11");

        assertThatThrownBy(() -> handler.handle(tampered))
                .isInstanceOfSatisfying(CreditOutcomeRejectedException.class, exception ->
                        assertThat(exception.getReasonCode()).isEqualTo("EVENT_ID_CONFLICT"));
        assertThat(tampered).contains(eventId);
    }

    @Test
    void creditReservationRejectedEndsTheOrder() {
        UUID orderId = createOrder();

        handler.handle(outcome(published(orderId, "OrderSubmitted"), "CreditReservationRejected",
                Map.of("reasonCode", "INSUFFICIENT_CREDITS")));

        assertThat(order(orderId).getState()).isEqualTo(OrderState.RESERVATION_FAILED);
        assertThat(order(orderId).getTerminalReason()).isEqualTo(TerminalReason.INSUFFICIENT_CREDITS);
    }

    @Test
    void creditReservationRejectedKeepsTheAccountReasonAndFallsBackForOthers() {
        UUID noAccount = createOrder();
        handler.handle(outcome(published(noAccount, "OrderSubmitted"), "CreditReservationRejected",
                Map.of("reasonCode", "CREDIT_ACCOUNT_NOT_FOUND")));
        assertThat(order(noAccount).getTerminalReason()).isEqualTo(TerminalReason.CREDIT_ACCOUNT_NOT_FOUND);

        UUID other = createOrder();
        handler.handle(outcome(published(other, "OrderSubmitted"), "CreditReservationRejected",
                Map.of("reasonCode", "REQUEST_CONFLICT")));
        assertThat(order(other).getState()).isEqualTo(OrderState.RESERVATION_FAILED);
        assertThat(order(other).getTerminalReason()).isEqualTo(TerminalReason.CREDIT_RESERVATION_REJECTED);
    }

    @Test
    void releaseSettlementAndCompensationOnlySetTheCreditStatus() {
        UUID cancelled = createOrder();
        handler.handle(reserved(published(cancelled, "OrderSubmitted"), UUID.randomUUID()));
        orderService.cancel(cancelled, REQUESTER);
        handler.handle(outcome(published(cancelled, "OrderCancelled"), "CreditReleased",
                Map.of("releasedAmount", 10, "availableBalance", 10, "reservedBalance", 0)));
        assertThat(order(cancelled).getState()).isEqualTo(OrderState.CANCELLED);
        assertThat(order(cancelled).getCreditStatus()).isEqualTo(CreditStatus.RELEASED);

        UUID compensated = createOrder();
        handler.handle(reserved(published(compensated, "OrderSubmitted"), UUID.randomUUID()));
        orderService.accept(compensated, COURIER);
        orderService.cancel(compensated, REQUESTER);
        JsonNode cancelledEvent = published(compensated, "OrderCancelled");
        assertThat(cancelledEvent.get("data").get("compensationRequired").asBoolean()).isTrue();
        assertThat(cancelledEvent.get("data").get("courierId").asString()).isEqualTo(COURIER.toString());
        handler.handle(outcome(cancelledEvent, "CourierCompensated", Map.of("requesterId", REQUESTER.toString(),
                "courierId", COURIER.toString(), "transferredAmount", 2, "releasedAmount", 8,
                "requesterAvailableBalance", 8, "courierAvailableBalance", 12)));
        assertThat(order(compensated).getState()).isEqualTo(OrderState.CANCELLED);
        assertThat(order(compensated).getCreditStatus()).isEqualTo(CreditStatus.COMPENSATED);

        UUID settled = createOrder();
        handler.handle(reserved(published(settled, "OrderSubmitted"), UUID.randomUUID()));
        orderService.accept(settled, COURIER);
        orderService.pickUp(settled, COURIER);
        orderService.deliver(settled, COURIER);
        orderService.complete(settled, REQUESTER);
        handler.handle(outcome(published(settled, "OrderCompleted"), "CreditSettled", Map.of(
                "requesterId", REQUESTER.toString(), "courierId", COURIER.toString(), "transferredAmount", 10,
                "requesterAvailableBalance", 0, "courierAvailableBalance", 20)));
        assertThat(order(settled).getState()).isEqualTo(OrderState.COMPLETED);
        assertThat(order(settled).getCreditStatus()).isEqualTo(CreditStatus.SETTLED);
    }

    @Test
    void anOutcomeForAnUnknownOperationIsRejectedAndNotRecorded() {
        UUID orderId = createOrder();
        String event = reserved(published(orderId, "OrderSubmitted"), UUID.randomUUID())
                .replaceFirst("\"operationId\":\"[^\"]+\"", "\"operationId\":\"" + UUID.randomUUID() + "\"");

        assertThatThrownBy(() -> handler.handle(event))
                .isInstanceOfSatisfying(CreditOutcomeRejectedException.class, exception ->
                        assertThat(exception.getReasonCode()).isEqualTo("UNKNOWN_OPERATION"));
        assertThat(order(orderId).getState()).isEqualTo(OrderState.PENDING_CREDIT);
        assertThat(jdbc.queryForObject("select count(*) from processed_events where aggregate_id = ?",
                Integer.class, orderId)).isZero();
    }

    @Test
    void anOutcomeAnsweringTheWrongKindOfCommandIsAnOperationConflict() {
        UUID orderId = createOrder();

        assertThatThrownBy(() -> handler.handle(outcome(published(orderId, "OrderSubmitted"), "CreditSettled",
                Map.of("requesterId", REQUESTER.toString(), "courierId", COURIER.toString(), "transferredAmount", 10,
                        "requesterAvailableBalance", 0, "courierAvailableBalance", 10))))
                .isInstanceOfSatisfying(CreditOutcomeRejectedException.class, exception ->
                        assertThat(exception.getReasonCode()).isEqualTo("OPERATION_ID_CONFLICT"));
        assertThat(order(orderId).getCreditStatus()).isNull();
    }

    @Test
    void aReleaseAnsweringACommandThatFreesNoCreditIsAnOperationConflict() {
        UUID orderId = createOrder();
        handler.handle(reserved(published(orderId, "OrderSubmitted"), UUID.randomUUID()));
        orderService.accept(orderId, COURIER);
        orderService.pickUp(orderId, COURIER);
        orderService.deliver(orderId, COURIER);
        orderService.complete(orderId, REQUESTER);

        assertThatThrownBy(() -> handler.handle(outcome(published(orderId, "OrderCompleted"), "CreditReleased",
                Map.of("releasedAmount", 10, "availableBalance", 10, "reservedBalance", 0))))
                .isInstanceOfSatisfying(CreditOutcomeRejectedException.class, exception ->
                        assertThat(exception.getReasonCode()).isEqualTo("OPERATION_ID_CONFLICT"));
        assertThat(order(orderId).getCreditStatus()).isEqualTo(CreditStatus.RESERVED);
    }

    @Test
    void aReleaseAnsweringAnExpirySetsTheCreditStatus() {
        UUID orderId = createOrder();
        String reservedLate = reserved(published(orderId, "OrderSubmitted"), UUID.randomUUID());
        jdbc.update("update orders set pickup_deadline = created_at + interval '1 microsecond' where id = ?", orderId);
        // Reserved at or after the deadline: the order expires and asks Credit to release.
        handler.handle(reservedLate);
        assertThat(order(orderId).getState()).isEqualTo(OrderState.EXPIRED);

        assertThat(handler.handle(outcome(published(orderId, "OrderExpired"), "CreditReleased",
                Map.of("releasedAmount", 10, "availableBalance", 10, "reservedBalance", 0))))
                .isEqualTo(Outcome.APPLIED);
        assertThat(order(orderId).getCreditStatus()).isEqualTo(CreditStatus.RELEASED);
    }

    @Test
    void eventsFromTheWrongProducerAreRejected() {
        UUID orderId = createOrder();
        String forged = reserved(published(orderId, "OrderSubmitted"), UUID.randomUUID())
                .replace("\"producer\":\"credit-service\"", "\"producer\":\"user-service\"");

        assertThatThrownBy(() -> handler.handle(forged))
                .isInstanceOfSatisfying(CreditOutcomeRejectedException.class, exception ->
                        assertThat(exception.getReasonCode()).isEqualTo("INVALID_EVENT"));
        assertThat(order(orderId).getState()).isEqualTo(OrderState.PENDING_CREDIT);
    }

    @Test
    void creditEventsWithNoOrderBehaviourAreRecordedAndIgnored() {
        String allocation = json.writeValueAsString(Map.of(
                "eventId", UUID.randomUUID().toString(), "eventType", "CreditAccountAllocated",
                "eventVersion", 1, "aggregateType", "User", "aggregateId", REQUESTER.toString(),
                "aggregateVersion", 1, "producer", "credit-service", "correlationId", UUID.randomUUID().toString(),
                "data", Map.of("operationId", UUID.randomUUID().toString(), "userId", REQUESTER.toString(),
                        "allocatedAmount", 10, "availableBalance", 10)));

        assertThat(handler.handle(allocation)).isEqualTo(Outcome.IGNORED);
    }

    @Test
    void onlyTheFiveBlueprintOrderEventsArePublished() {
        UUID orderId = createOrder();
        handler.handle(reserved(published(orderId, "OrderSubmitted"), UUID.randomUUID()));
        orderService.accept(orderId, COURIER);
        orderService.withdraw(orderId, COURIER);
        orderService.accept(orderId, COURIER);
        orderService.pickUp(orderId, COURIER);
        orderService.deliver(orderId, COURIER);
        orderService.complete(orderId, REQUESTER);

        List<String> published = outboxEventRepository.findByAggregateIdOrderByAggregateVersionAsc(orderId).stream()
                .map(OutboxEvent::getEventType)
                .toList();
        assertThat(published).containsExactly("OrderSubmitted", "OrderCompleted");
        assertThat(published).isSubsetOf("OrderSubmitted", "OrderRewardChangeRequested", "OrderCancelled",
                "OrderExpired", "OrderCompleted");
    }
}
