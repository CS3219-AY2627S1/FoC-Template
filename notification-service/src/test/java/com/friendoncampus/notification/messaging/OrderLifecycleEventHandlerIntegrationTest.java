package com.friendoncampus.notification.messaging;

import static com.friendoncampus.notification.messaging.OrderEvents.data;
import static com.friendoncampus.notification.messaging.OrderEvents.json;
import static com.friendoncampus.notification.messaging.OrderEvents.system;
import static com.friendoncampus.notification.messaging.OrderEvents.transition;
import static com.friendoncampus.notification.messaging.OrderEvents.user;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import com.friendoncampus.notification.domain.Notification;
import com.friendoncampus.notification.domain.NotificationMessages;
import com.friendoncampus.notification.messaging.CreditEventHandler.Outcome;
import com.friendoncampus.notification.messaging.OrderEvents.Errand;
import com.friendoncampus.notification.repository.NotificationRepository;
import com.networknt.schema.InputFormat;
import com.networknt.schema.Schema;
import com.networknt.schema.SchemaRegistry;
import com.networknt.schema.SpecificationVersion;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * {@code OrderTransitioned} shaped as the shared contract defines it, handled against a real
 * PostgreSQL. Every test event is first checked against {@code docs/contracts/n2h-events.schema.json}.
 * Requires Docker.
 */
@SpringBootTest(properties = "app.kafka.enabled=false")
@Testcontainers
@ExtendWith(OutputCaptureExtension.class)
class OrderLifecycleEventHandlerIntegrationTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    private static final Path CONTRACT = Path.of("../docs/contracts/n2h-events.schema.json");
    private static final Path FIXTURES = Path.of("../docs/contracts/events.examples.json");
    private static final UUID REQUESTER = UUID.fromString("97947588-bb2e-42f2-91ba-9abf8e15a8e7");
    private static final UUID ALICE = UUID.fromString("5b0f3c1e-8a52-4f8e-9d37-2c1b6e4a7f10");
    private static final UUID BOB = UUID.fromString("2d3c4b5a-6978-4f1e-8d2c-3b4a5f6e7d8c");

    private static Schema contract;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @Autowired
    private OrderLifecycleEventHandler handler;

    @Autowired
    private NotificationRepository notificationRepository;

    @Autowired
    private JdbcTemplate jdbc;

    private final JsonMapper jsonMapper = JsonMapper.builder().build();

    @BeforeAll
    static void loadContract() throws Exception {
        contract = SchemaRegistry.withDefaultDialect(SpecificationVersion.DRAFT_2020_12)
                .getSchema(Files.readString(CONTRACT), InputFormat.JSON);
    }

    /** Handles a contract-valid event. */
    private Outcome handle(Map<String, Object> event) {
        assertThat(contract.validate(json(event), InputFormat.JSON)).as(json(event)).isEmpty();
        return handler.handle(json(event));
    }

    private List<Notification> notificationsFrom(Map<String, Object> event) {
        return jdbc.queryForList("select id from notifications where source_event_id = ?::uuid", UUID.class,
                event.get("eventId")).stream().map(id -> notificationRepository.findById(id).orElseThrow()).toList();
    }

    private Notification onlyNotificationFrom(Map<String, Object> event) {
        List<Notification> rows = notificationsFrom(event);
        assertThat(rows).hasSize(1);
        return rows.get(0);
    }

    private String inboxOutcome(Map<String, Object> event) {
        List<String> outcomes = jdbc.queryForList("select outcome from notification_inbox where event_id = ?::uuid",
                String.class, event.get("eventId"));
        return outcomes.isEmpty() ? null : outcomes.get(0);
    }

    private static Map<String, Object> courier(UUID id) {
        return user(id, "COURIER");
    }

    private static Map<String, Object> requester() {
        return user(REQUESTER, "REQUESTER");
    }

    @Test
    void eachMappedTransitionNotifiesItsRecipientWithTheApprovedMessage() {
        record Row(Map<String, Object> event, UUID recipient, String type, String message) {
        }
        Errand e = Errand.create(REQUESTER);
        List<Row> rows = List.of(
                new Row(transition(e, 2, "OPEN", "PENDING_CREDIT", "OPEN", system(), null, null, null), REQUESTER,
                        "ORDER_OPENED", "Your errand \"Buy coffee\" is live. Couriers can now accept it."),
                new Row(transition(e, 3, "ACCEPT", "OPEN", "ACCEPTED", courier(ALICE), null, ALICE, null), REQUESTER,
                        "ORDER_ACCEPTED", "A courier accepted your errand \"Buy coffee\"."),
                new Row(transition(e, 4, "WITHDRAW", "ACCEPTED", "OPEN", courier(ALICE), ALICE, null, null), REQUESTER,
                        "ORDER_COURIER_WITHDREW",
                        "Your courier withdrew from \"Buy coffee\". It's open for other couriers again."),
                new Row(transition(e, 5, "ACCEPT", "OPEN", "ACCEPTED", courier(BOB), null, BOB, null), REQUESTER,
                        "ORDER_ACCEPTED", "A courier accepted your errand \"Buy coffee\"."),
                new Row(transition(e, 6, "PICK_UP", "ACCEPTED", "PICKED_UP", courier(BOB), null, BOB, null), REQUESTER,
                        "ORDER_PICKED_UP", "Your courier picked up \"Buy coffee\"."),
                new Row(transition(e, 7, "DELIVER", "PICKED_UP", "DELIVERED", courier(BOB), null, BOB, null), REQUESTER,
                        "ORDER_DELIVERED", "Your courier delivered \"Buy coffee\". Please confirm you received it."),
                new Row(transition(e, 8, "COMPLETE", "DELIVERED", "COMPLETED", requester(), null, BOB, null), BOB,
                        "ORDER_COMPLETED", "The requester confirmed they received \"Buy coffee\"."));

        for (Row row : rows) {
            assertThat(handle(row.event())).as(row.type()).isEqualTo(Outcome.NOTIFIED);
            Notification n = onlyNotificationFrom(row.event());
            assertThat(n.getRecipientId()).as(row.type()).isEqualTo(row.recipient());
            assertThat(n.getType().name()).isEqualTo(row.type());
            assertThat(n.getOrderId()).isEqualTo(e.orderId());
            assertThat(NotificationMessages.messageFor(n)).isEqualTo(row.message());
        }
        // Two genuine acceptance cycles are two notifications (keys :3 and :5).
        assertThat(jdbc.queryForObject("select count(*) from notifications where order_id = ? and type = 'ORDER_ACCEPTED'",
                Integer.class, e.orderId())).isEqualTo(2);
    }

    @Test
    void expiryAndCancellationReachTheRightPerson() {
        Errand late = Errand.create(REQUESTER);
        Map<String, Object> reservedTooLate = transition(late, 2, "OPEN", "PENDING_CREDIT", "EXPIRED", system(), null,
                null, "PICKUP_DEADLINE_PASSED");
        Errand expired = Errand.create(REQUESTER);
        Map<String, Object> scheduledExpiry = transition(expired, 3, "EXPIRE", "OPEN", "EXPIRED", system(), null, null,
                "PICKUP_DEADLINE_PASSED");
        Errand withdrawnLate = Errand.create(REQUESTER);
        Map<String, Object> withdrewAfterDeadline = transition(withdrawnLate, 4, "WITHDRAW", "ACCEPTED", "EXPIRED",
                courier(ALICE), ALICE, null, "COURIER_WITHDREW_AFTER_DEADLINE");
        Errand cancelled = Errand.create(REQUESTER);
        Map<String, Object> cancelAfterAccept = transition(cancelled, 4, "CANCEL", "ACCEPTED", "CANCELLED", requester(),
                ALICE, null, "REQUESTER_CANCELLED_ACCEPTED");

        for (Map<String, Object> event : List.of(reservedTooLate, scheduledExpiry, withdrewAfterDeadline)) {
            assertThat(handle(event)).isEqualTo(Outcome.NOTIFIED);
            Notification n = onlyNotificationFrom(event);
            assertThat(n.getType().name()).isEqualTo("ORDER_EXPIRED");
            assertThat(n.getRecipientId()).isEqualTo(REQUESTER);
            assertThat(NotificationMessages.messageFor(n)).isEqualTo(
                    "Your errand \"Buy coffee\" expired before pickup. Your reserved credits are being returned.");
        }
        assertThat(handle(cancelAfterAccept)).isEqualTo(Outcome.NOTIFIED);
        Notification cancel = onlyNotificationFrom(cancelAfterAccept);
        assertThat(cancel.getRecipientId()).as("the courier the cancellation removed").isEqualTo(ALICE);
        assertThat(NotificationMessages.messageFor(cancel)).isEqualTo("The requester cancelled \"Buy coffee\".");
    }

    @Test
    void aCreditTimeoutTellsTheRequesterTheErrandWasNotPosted() {
        Map<String, Object> event = transition(Errand.create(REQUESTER), 2, "EXPIRE", "PENDING_CREDIT", "EXPIRED",
                system(), null, null, "CREDIT_RESERVATION_TIMEOUT");

        assertThat(handle(event)).isEqualTo(Outcome.NOTIFIED);
        Notification n = onlyNotificationFrom(event);
        assertThat(n.getType().name()).isEqualTo("ORDER_RESERVATION_FAILED");
        assertThat(n.getRecipientId()).isEqualTo(REQUESTER);
        assertThat(NotificationMessages.messageFor(n)).isEqualTo(
                "Your errand \"Buy coffee\" couldn't be posted: Credit didn't confirm your credits in time.");
    }

    @Test
    void aFailedReservationShowsOnlyApprovedReasons() {
        Map<String, String> expected = new LinkedHashMap<>();
        expected.put("INSUFFICIENT_CREDITS", "you don't have enough credits");
        expected.put("CREDIT_ACCOUNT_NOT_FOUND", "your credit account isn't set up yet");
        expected.put("CREDIT_RESERVATION_REJECTED", "the credits couldn't be reserved");
        expected.put("SOMETHING_NEW_FROM_CREDIT", "the credits couldn't be reserved");

        expected.forEach((code, reason) -> {
            Map<String, Object> event = transition(Errand.create(REQUESTER), 2, "FAIL_RESERVATION", "PENDING_CREDIT",
                    "RESERVATION_FAILED", system(), null, null, code);
            assertThat(handle(event)).isEqualTo(Outcome.NOTIFIED);
            assertThat(NotificationMessages.messageFor(onlyNotificationFrom(event)))
                    .isEqualTo("Your errand \"Buy coffee\" couldn't be posted: " + reason + ".");
        });
    }

    @Test
    void transitionsWithNobodyToTellAreIgnored() {
        Errand e = Errand.create(REQUESTER);
        List<Map<String, Object>> events = List.of(
                transition(e, 1, "SUBMIT", null, "PENDING_CREDIT", requester(), null, null, null),
                transition(e, 2, "EDIT", "OPEN", "OPEN", requester(), null, null, null),
                transition(e, 3, "CANCEL", "OPEN", "CANCELLED", requester(), null, null, "REQUESTER_CANCELLED_OPEN"),
                transition(Errand.create(REQUESTER), 4, "REWARD_CHANGE_APPLIED", "OPEN", "OPEN", system(), null, null,
                        null),
                transition(Errand.create(REQUESTER), 4, "REWARD_CHANGE_REJECTED", "OPEN", "OPEN", system(), null, null,
                        null));

        for (Map<String, Object> event : events) {
            assertThat(handle(event)).as(data(event).get("action").toString()).isEqualTo(Outcome.IGNORED);
            assertThat(notificationsFrom(event)).isEmpty();
            assertThat(inboxOutcome(event)).isEqualTo("IGNORED");
        }
    }

    @Test
    void theActorIsNeverNotified() {
        // COMPLETE tells the courier; if the event says the courier performed it, they are not told.
        Errand e = Errand.create(REQUESTER);
        Map<String, Object> event = transition(e, 8, "COMPLETE", "DELIVERED", "COMPLETED", courier(BOB), null, BOB,
                null);

        assertThat(handle(event)).isEqualTo(Outcome.IGNORED);
        assertThat(notificationsFrom(event)).isEmpty();
    }

    @Test
    void theSameTransitionUnderANewEventIdNotifiesOnce() {
        Errand e = Errand.create(REQUESTER);
        Map<String, Object> first = transition(e, 3, "ACCEPT", "OPEN", "ACCEPTED", courier(ALICE), null, ALICE, null);
        Map<String, Object> republished = new LinkedHashMap<>(first);
        republished.put("eventId", UUID.randomUUID().toString());

        assertThat(handle(first)).isEqualTo(Outcome.NOTIFIED);
        assertThat(handle(republished)).isEqualTo(Outcome.DUPLICATE_OPERATION);

        assertThat(notificationsFrom(republished)).isEmpty();
        assertThat(inboxOutcome(republished)).isEqualTo("DUPLICATE_OPERATION");
        assertThat(onlyNotificationFrom(first).getBusinessKey()).isEqualTo(e.orderId() + ":3");
    }

    @Test
    void aRedeliveryIsADuplicateAndAReusedEventIdIsRejected() {
        Map<String, Object> event = transition(Errand.create(REQUESTER), 3, "ACCEPT", "OPEN", "ACCEPTED",
                courier(ALICE), null, ALICE, null);

        assertThat(handle(event)).isEqualTo(Outcome.NOTIFIED);
        assertThat(handler.handle(json(event))).isEqualTo(Outcome.DUPLICATE);

        data(event).put("toState", "PICKED_UP");
        assertThatThrownBy(() -> handler.handle(json(event)))
                .isInstanceOfSatisfying(EventRejectedException.class,
                        rejected -> assertThat(rejected.getReasonCode()).isEqualTo("EVENT_ID_CONFLICT"));
        assertThat(notificationsFrom(event)).hasSize(1);
    }

    @Test
    void aGapInTheSequenceIsLoggedAndTheEventStillHandled(CapturedOutput output) {
        Errand e = Errand.create(REQUESTER);
        handle(transition(e, 2, "OPEN", "PENDING_CREDIT", "OPEN", system(), null, null, null));
        Map<String, Object> afterGap = transition(e, 5, "ACCEPT", "OPEN", "ACCEPTED", courier(ALICE), null, ALICE,
                null);

        assertThat(handle(afterGap)).isEqualTo(Outcome.NOTIFIED);

        assertThat(output.getOut()).contains("Gap in order lifecycle events orderId=" + e.orderId()
                + " lastSourceSequence=2 receivedSourceSequence=5");
        assertThat(jdbc.queryForObject("select count(*) from notifications where order_id = ?", Integer.class,
                e.orderId())).as("no transition is guessed").isEqualTo(2);
    }

    @Test
    void theSharedFixtureIsHandled() throws Exception {
        JsonNode fixture = null;
        for (JsonNode example : jsonMapper.readTree(Files.readString(FIXTURES))) {
            if ("order.lifecycle.events".equals(example.path("topic").asString())) {
                fixture = example.get("event");
            }
        }
        assertThat(fixture).as("events.examples.json has an order.lifecycle.events example").isNotNull();
        String event = jsonMapper.writeValueAsString(fixture);
        assertThat(contract.validate(event, InputFormat.JSON)).isEmpty();

        Outcome outcome = handler.handle(event);

        // The fixture is an ACCEPT whose requester is told; it is a valid event either way.
        assertThat(outcome).isIn(Outcome.NOTIFIED, Outcome.IGNORED);
        assertThat(jdbc.queryForObject("select count(*) from notification_inbox where event_id = ?::uuid",
                Integer.class, fixture.get("eventId").asString())).isEqualTo(1);
    }

    @Test
    void anEventBreakingTheContractIsRejectedWithNothingStored() {
        List<Consumer<Map<String, Object>>> breakages = List.of(
                event -> event.put("producer", "credit-service"),
                event -> event.put("eventType", "OrderSubmitted"),
                event -> event.put("eventVersion", 2),
                event -> event.put("aggregateType", "User"),
                event -> event.put("aggregateId", UUID.randomUUID().toString()),
                event -> event.remove("correlationId"),
                event -> event.put("occurredAt", "yesterday"),
                event -> event.put("data", "not an object"),
                event -> data(event).put("sourceSequence", 0),
                event -> data(event).put("sourceSequence", "4"),
                event -> data(event).remove("requesterId"),
                event -> data(event).put("requesterId", "not-a-uuid"),
                event -> data(event).remove("snapshot"));

        for (Consumer<Map<String, Object>> breakage : breakages) {
            Map<String, Object> event = transition(Errand.create(REQUESTER), 3, "ACCEPT", "OPEN", "ACCEPTED",
                    courier(ALICE), null, ALICE, null);
            breakage.accept(event);

            assertThatThrownBy(() -> handler.handle(json(event)))
                    .isInstanceOfSatisfying(EventRejectedException.class,
                            rejected -> assertThat(rejected.getReasonCode()).isEqualTo("INVALID_EVENT"));
            assertThat(notificationsFrom(event)).isEmpty();
            assertThat(inboxOutcome(event)).isNull();
        }
    }

    @Test
    void aCancellationAfterAcceptanceWithoutTheCourierIsRejectedNotSentToAnyone() {
        Map<String, Object> event = transition(Errand.create(REQUESTER), 4, "CANCEL", "ACCEPTED", "CANCELLED",
                requester(), null, null, "REQUESTER_CANCELLED_ACCEPTED");

        assertThatThrownBy(() -> handler.handle(json(event)))
                .isInstanceOfSatisfying(EventRejectedException.class,
                        rejected -> assertThat(rejected.getReasonCode()).isEqualTo("INVALID_EVENT"));
        assertThat(notificationsFrom(event)).isEmpty();
    }
}
