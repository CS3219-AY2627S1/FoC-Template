package com.friendoncampus.notification.messaging;

import static com.friendoncampus.notification.messaging.CreditEvents.accountAllocated;
import static com.friendoncampus.notification.messaging.CreditEvents.compensated;
import static com.friendoncampus.notification.messaging.CreditEvents.data;
import static com.friendoncampus.notification.messaging.CreditEvents.json;
import static com.friendoncampus.notification.messaging.CreditEvents.reserved;
import static com.friendoncampus.notification.messaging.CreditEvents.settled;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;

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

import com.friendoncampus.notification.messaging.CreditEventHandler.Outcome;

import tools.jackson.databind.json.JsonMapper;

/**
 * {@code credit.events} shaped exactly as Credit Service publishes them, handled against a real
 * PostgreSQL. Requires Docker.
 */
@SpringBootTest(properties = "app.kafka.enabled=false")
@Testcontainers
class CreditEventHandlerIntegrationTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    private static final UUID REQUESTER = UUID.fromString("97947588-bb2e-42f2-91ba-9abf8e15a8e7");
    private static final UUID COURIER = UUID.fromString("5b0f3c1e-8a52-4f8e-9d37-2c1b6e4a7f10");

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @Autowired
    private CreditEventHandler handler;

    @Autowired
    private JdbcTemplate jdbc;

    private final JsonMapper jsonMapper = JsonMapper.builder().build();

    private List<Map<String, Object>> notificationsFrom(Object eventId) {
        return jdbc.queryForList("select recipient_id, type, order_id, params::text as params, occurred_at "
                + "from notifications where source_event_id = ?::uuid", eventId.toString());
    }

    private String inboxOutcome(Object eventId) {
        List<String> outcomes = jdbc.queryForList(
                "select outcome from notification_inbox where event_id = ?::uuid", String.class, eventId.toString());
        return outcomes.isEmpty() ? null : outcomes.get(0);
    }

    private int amount(Map<String, Object> row) {
        return jsonMapper.readTree((String) row.get("params")).get("amount").asInt();
    }

    @Test
    void anAllocatedAccountWelcomesItsUser() {
        UUID user = UUID.randomUUID();
        Map<String, Object> event = accountAllocated(user);

        assertThat(handler.handle(json(event))).isEqualTo(Outcome.NOTIFIED);

        List<Map<String, Object>> rows = notificationsFrom(event.get("eventId"));
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).get("recipient_id")).isEqualTo(user);
        assertThat(rows.get(0).get("type")).isEqualTo("CREDITS_WELCOME");
        assertThat(rows.get(0).get("order_id")).isNull();
        assertThat(amount(rows.get(0))).isEqualTo(10);
        assertThat(((java.sql.Timestamp) rows.get(0).get("occurred_at")).toInstant())
                .isEqualTo(OffsetDateTime.parse(CreditEvents.OCCURRED_AT).toInstant());
        assertThat(inboxOutcome(event.get("eventId"))).isEqualTo("NOTIFIED");
        assertThat(jdbc.queryForObject("select topic from notification_inbox where event_id = ?::uuid",
                String.class, event.get("eventId"))).isEqualTo("credit.events");
    }

    @Test
    void aSettledOrderPaysOnlyTheCourier() {
        UUID orderId = UUID.randomUUID();
        Map<String, Object> event = settled(orderId, REQUESTER, COURIER, 3);

        assertThat(handler.handle(json(event))).isEqualTo(Outcome.NOTIFIED);

        List<Map<String, Object>> rows = notificationsFrom(event.get("eventId"));
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).get("recipient_id")).isEqualTo(COURIER);
        assertThat(rows.get(0).get("type")).isEqualTo("CREDITS_RECEIVED");
        assertThat(rows.get(0).get("order_id")).isEqualTo(orderId);
        assertThat(amount(rows.get(0))).isEqualTo(3);
    }

    @Test
    void aCompensatedCourierIsToldTheTransferredAmount() {
        UUID orderId = UUID.randomUUID();
        Map<String, Object> event = compensated(orderId, REQUESTER, COURIER, 1);

        assertThat(handler.handle(json(event))).isEqualTo(Outcome.NOTIFIED);

        List<Map<String, Object>> rows = notificationsFrom(event.get("eventId"));
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).get("recipient_id")).isEqualTo(COURIER);
        assertThat(rows.get(0).get("type")).isEqualTo("CREDITS_COMPENSATED");
        assertThat(rows.get(0).get("order_id")).isEqualTo(orderId);
        assertThat(amount(rows.get(0))).isEqualTo(1);
    }

    @Test
    void creditEventsThatNotifyNobodyAreRecordedAsIgnored() {
        Map<String, Object> reservedEvent = reserved(UUID.randomUUID());
        Map<String, Object> futureEvent = CreditEvents.envelope("CreditSomethingNew", "Order", UUID.randomUUID(),
                Map.of());

        for (Map<String, Object> event : List.of(reservedEvent, futureEvent)) {
            assertThat(handler.handle(json(event))).isEqualTo(Outcome.IGNORED);
            assertThat(notificationsFrom(event.get("eventId"))).isEmpty();
            assertThat(inboxOutcome(event.get("eventId"))).isEqualTo("IGNORED");
        }
    }

    @Test
    void aRedeliveredEventNotifiesOnce() {
        String event = json(settled(UUID.randomUUID(), REQUESTER, COURIER, 3));
        Object eventId = jsonMapper.readTree(event).get("eventId").asString();

        assertThat(handler.handle(event)).isEqualTo(Outcome.NOTIFIED);
        assertThat(handler.handle(event)).isEqualTo(Outcome.DUPLICATE);

        assertThat(notificationsFrom(eventId)).hasSize(1);
        assertThat(jdbc.queryForObject("select count(*) from notification_inbox where event_id = ?::uuid",
                Integer.class, eventId)).isEqualTo(1);
    }

    /** The same Credit outcome published again under a fresh eventId, as a reconciliation replay does. */
    private static Map<String, Object> republished(Map<String, Object> event) {
        Map<String, Object> copy = new LinkedHashMap<>(event);
        copy.put("eventId", UUID.randomUUID().toString());
        copy.put("data", new LinkedHashMap<>(data(event)));
        return copy;
    }

    @Test
    void theSameOperationUnderANewEventIdNotifiesOnce() {
        Map<String, Object> first = settled(UUID.randomUUID(), REQUESTER, COURIER, 3);
        Map<String, Object> again = republished(first);

        assertThat(handler.handle(json(first))).isEqualTo(Outcome.NOTIFIED);
        assertThat(handler.handle(json(again))).isEqualTo(Outcome.DUPLICATE_OPERATION);

        assertThat(notificationsFrom(first.get("eventId"))).hasSize(1);
        assertThat(notificationsFrom(again.get("eventId"))).isEmpty();
        assertThat(inboxOutcome(again.get("eventId"))).isEqualTo("DUPLICATE_OPERATION");
        assertThat(jdbc.queryForObject("select business_key from notifications where source_event_id = ?::uuid",
                String.class, first.get("eventId"))).isEqualTo(data(first).get("operationId"));
    }

    @Test
    void aRepeatedOperationWithDifferentValuesStillKeepsTheFirstNotification() {
        Map<String, Object> first = settled(UUID.randomUUID(), REQUESTER, COURIER, 3);
        Map<String, Object> again = republished(first);
        data(again).put("transferredAmount", 30);

        handler.handle(json(first));

        assertThat(handler.handle(json(again))).isEqualTo(Outcome.DUPLICATE_OPERATION);
        List<Map<String, Object>> rows = notificationsFrom(first.get("eventId"));
        assertThat(rows).hasSize(1);
        assertThat(amount(rows.get(0))).isEqualTo(3);
    }

    @Test
    void anOperationIdIsOnlyADuplicateForTheSameRecipientAndType() {
        UUID orderId = UUID.randomUUID();
        Map<String, Object> settledEvent = settled(orderId, REQUESTER, COURIER, 3);
        Map<String, Object> otherCourier = republished(settledEvent);
        UUID secondCourier = UUID.randomUUID();
        data(otherCourier).put("courierId", secondCourier.toString());
        Map<String, Object> compensatedEvent = compensated(orderId, REQUESTER, COURIER, 1);
        data(compensatedEvent).put("operationId", data(settledEvent).get("operationId"));

        assertThat(handler.handle(json(settledEvent))).isEqualTo(Outcome.NOTIFIED);
        assertThat(handler.handle(json(otherCourier))).isEqualTo(Outcome.NOTIFIED);
        assertThat(handler.handle(json(compensatedEvent))).isEqualTo(Outcome.NOTIFIED);

        assertThat(jdbc.queryForObject("select count(*) from notifications where order_id = ?", Integer.class,
                orderId)).isEqualTo(3);
    }

    @Test
    void anEventIdReusedWithDifferentContentIsRejected() {
        Map<String, Object> event = settled(UUID.randomUUID(), REQUESTER, COURIER, 3);
        handler.handle(json(event));
        data(event).put("transferredAmount", 30);

        assertThatThrownBy(() -> handler.handle(json(event)))
                .isInstanceOfSatisfying(EventRejectedException.class,
                        rejected -> assertThat(rejected.getReasonCode()).isEqualTo("EVENT_ID_CONFLICT"));

        List<Map<String, Object>> rows = notificationsFrom(event.get("eventId"));
        assertThat(rows).hasSize(1);
        assertThat(amount(rows.get(0))).isEqualTo(3);
    }

    @Test
    void anEventBreakingTheContractIsRejectedWithNothingStored() {
        UUID orderId = UUID.randomUUID();
        List<Consumer<Map<String, Object>>> breakages = List.of(
                event -> event.put("producer", "order-service"),
                event -> event.put("eventVersion", 2),
                event -> event.put("aggregateType", "User"),
                event -> event.put("aggregateId", UUID.randomUUID().toString()),
                event -> event.remove("correlationId"),
                event -> event.put("occurredAt", "yesterday"),
                event -> event.put("data", "not an object"),
                event -> data(event).remove("courierId"),
                event -> data(event).put("courierId", "not-a-uuid"),
                event -> data(event).put("transferredAmount", 0),
                event -> data(event).put("transferredAmount", 2.5),
                event -> data(event).put("transferredAmount", "3"),
                event -> data(event).remove("operationId"),
                event -> data(event).put("operationId", "not-a-uuid"));

        for (Consumer<Map<String, Object>> breakage : breakages) {
            Map<String, Object> event = settled(orderId, REQUESTER, COURIER, 3);
            breakage.accept(event);

            assertThatThrownBy(() -> handler.handle(json(event)))
                    .isInstanceOfSatisfying(EventRejectedException.class,
                            rejected -> assertThat(rejected.getReasonCode()).isEqualTo("INVALID_EVENT"));
            assertThat(notificationsFrom(event.get("eventId"))).isEmpty();
            assertThat(inboxOutcome(event.get("eventId"))).isNull();
        }
    }

    @Test
    void anEventThatIsNotAJsonEnvelopeIsRejected() {
        for (String payload : List.of("not json", "[1,2]", "{\"eventType\":\"CreditSettled\"}")) {
            assertThatThrownBy(() -> handler.handle(payload))
                    .as(payload)
                    .isInstanceOfSatisfying(EventRejectedException.class,
                            rejected -> assertThat(rejected.getReasonCode()).isEqualTo("INVALID_EVENT"));
        }
    }
}
