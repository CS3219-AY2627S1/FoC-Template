package com.friendoncampus.order.messaging;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import com.friendoncampus.order.repository.OutboxEventRepository;
import com.friendoncampus.order.service.CreateOrderCommand;
import com.friendoncampus.order.service.OrderService;
import com.friendoncampus.order.support.MutableClock;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * {@link CreditReconciliation} against a real PostgreSQL: a command to Credit with no Credit outcome
 * for its {@code operationId} is reported once the threshold (default 10 minutes) has passed since it
 * was published, or written if still unpublished; any recorded outcome, IGNORED included, answers it;
 * a credit-timeout expiry is counted apart. Requires Docker.
 */
@SpringBootTest(properties = {"app.orders.expiry.enabled=false", "app.kafka.enabled=false",
        "app.orders.credit-reconciliation.enabled=false"})
@Testcontainers
@ExtendWith(OutputCaptureExtension.class)
class CreditReconciliationIntegrationTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    private static final UUID REQUESTER = UUID.fromString("97947588-bb2e-42f2-91ba-9abf8e15a8e7");
    private static final MutableClock CLOCK = new MutableClock(Instant.now());
    private static final Duration THRESHOLD = Duration.ofMinutes(10);

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
    private CreditReconciliation reconciliation;

    @Autowired
    private OrderService orderService;

    @Autowired
    private CreditOutcomeHandler creditOutcomeHandler;

    @Autowired
    private OutboxEventRepository outboxEventRepository;

    @Autowired
    private JdbcTemplate jdbc;

    private final JsonMapper json = JsonMapper.builder().build();

    @BeforeEach
    void reset() {
        CLOCK.set(Instant.now().truncatedTo(ChronoUnit.MICROS));
        // Counts below are of the whole outbox, so each test starts from an empty one.
        jdbc.update("delete from processed_events");
        jdbc.update("delete from outbox_events");
    }

    private UUID submit() {
        OffsetDateTime deadline = OffsetDateTime.ofInstant(CLOCK.instant(), ZoneOffset.UTC).plusHours(3);
        return orderService.createOrder(new CreateOrderCommand(REQUESTER, "Collect printing", "Grab my printout",
                UUID.randomUUID(), "COM1 Print Shop", UUID.randomUUID(), "UTown Residence", 10, deadline)).getId();
    }

    /** Marks the order's commands as acknowledged by Kafka now (the relay is off in this test). */
    private void publishNow(UUID orderId) {
        jdbc.update("update outbox_events set published_at = ? where aggregate_id = ? and published_at is null",
                OffsetDateTime.ofInstant(CLOCK.instant(), ZoneOffset.UTC), orderId);
    }

    private JsonNode command(UUID orderId, String eventType) {
        return json.readTree(outboxEventRepository.findByAggregateIdOrderByAggregateVersionAsc(orderId).stream()
                .filter(event -> event.getEventType().equals(eventType))
                .findFirst()
                .orElseThrow()
                .getPayload());
    }

    private String operationId(UUID orderId, String eventType) {
        return command(orderId, eventType).get("data").get("operationId").asString();
    }

    private String creditReserved(UUID orderId) {
        JsonNode submitted = command(orderId, "OrderSubmitted");
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("operationId", submitted.get("data").get("operationId").asString());
        data.put("orderId", orderId.toString());
        data.put("reservationId", UUID.randomUUID().toString());
        data.put("amount", 10);
        data.put("availableBalance", 0);
        data.put("reservedBalance", 10);
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("eventId", UUID.randomUUID().toString());
        envelope.put("eventType", "CreditReserved");
        envelope.put("eventVersion", 1);
        envelope.put("aggregateType", "Order");
        envelope.put("aggregateId", orderId.toString());
        envelope.put("aggregateVersion", submitted.get("aggregateVersion").asLong());
        envelope.put("occurredAt", "2026-11-09T10:00:00Z");
        envelope.put("producer", "credit-service");
        envelope.put("correlationId", submitted.get("correlationId").asString());
        envelope.put("causationId", submitted.get("eventId").asString());
        envelope.put("actor", Map.of("type", "SYSTEM"));
        envelope.put("data", data);
        return json.writeValueAsString(envelope);
    }

    @Test
    void theThresholdIsTenMinutesByDefault() {
        assertThat(reconciliation.after()).isEqualTo(THRESHOLD);
    }

    @Test
    void anAnsweredCommandIsNeverReported() {
        UUID orderId = submit();
        publishNow(orderId);
        creditOutcomeHandler.handle(creditReserved(orderId));

        CLOCK.advance(Duration.ofHours(1));
        CreditReconciliation.Result result = reconciliation.check();

        assertThat(result.unanswered()).isZero();
        assertThat(result.newlyReported()).isZero();
    }

    @Test
    void aCommandWithoutAnOutcomeIsReportedOnceTheThresholdHasPassed(CapturedOutput output) {
        UUID orderId = submit();
        publishNow(orderId);

        CLOCK.advance(THRESHOLD.minusNanos(1_000));
        assertThat(reconciliation.check().unanswered()).isZero();

        CLOCK.advance(Duration.ofNanos(1_000));
        CreditReconciliation.Result result = reconciliation.check();

        assertThat(result.unanswered()).isEqualTo(1);
        assertThat(result.newlyReported()).isEqualTo(1);
        assertThat(output.getOut()).contains("outcome=CREDIT_OUTCOME_MISSING")
                .contains("eventType=OrderSubmitted")
                .contains("operationId=" + operationId(orderId, "OrderSubmitted"))
                .contains("orderId=" + orderId)
                .contains("ageSeconds=600 published");
    }

    @Test
    void aCommandStillUnpublishedIsReportedFromWhenItWasWritten(CapturedOutput output) {
        UUID orderId = submit();

        CLOCK.advance(THRESHOLD);
        CreditReconciliation.Result result = reconciliation.check();

        assertThat(result.unanswered()).isEqualTo(1);
        assertThat(output.getOut()).contains("orderId=" + orderId).contains("unpublished");
    }

    @Test
    void repeatedChecksWarnAboutACommandOnlyOnce(CapturedOutput output) {
        UUID orderId = submit();
        publishNow(orderId);
        CLOCK.advance(THRESHOLD);

        assertThat(reconciliation.check().newlyReported()).isEqualTo(1);
        assertThat(reconciliation.check().newlyReported()).isZero();
        assertThat(reconciliation.check().unanswered()).isEqualTo(1);

        String marker = "outcome=CREDIT_OUTCOME_MISSING eventId=";
        assertThat(output.getOut().split(java.util.regex.Pattern.quote(marker), -1)).hasSize(2);
    }

    @Test
    void anIgnoredLateAnswerStillAnswersTheCommandAndATimeoutIsCountedApart(CapturedOutput output) {
        UUID orderId = submit();
        publishNow(orderId);
        CLOCK.advance(Duration.ofMinutes(2));
        orderService.timeOutPendingCreditIfDue(orderId);
        publishNow(orderId);
        // Credit answers the submission late: recorded as IGNORED, which still answers OrderSubmitted.
        assertThat(creditOutcomeHandler.handle(creditReserved(orderId))).isEqualTo(CreditOutcomeHandler.Outcome.IGNORED);

        CLOCK.advance(THRESHOLD);
        CreditReconciliation.Result result = reconciliation.check();

        assertThat(result.unanswered()).as("OrderSubmitted is answered").isZero();
        assertThat(result.timeoutsWithoutAnswer()).as("the timeout's OrderExpired has no CreditReleased yet")
                .isEqualTo(1);
        assertThat(output.getOut()).contains("outcome=TIMEOUT_UNANSWERED")
                .contains("operationId=" + operationId(orderId, "OrderExpired"))
                .doesNotContain("outcome=CREDIT_OUTCOME_MISSING");
    }

    @Test
    void theGaugesReportTheUnansweredBacklog() {
        UUID older = submit();
        publishNow(older);
        CLOCK.advance(Duration.ofMinutes(5));
        UUID newer = submit();
        publishNow(newer);
        UUID answered = submit();
        publishNow(answered);
        creditOutcomeHandler.handle(creditReserved(answered));

        CLOCK.advance(Duration.ofMinutes(15));
        reconciliation.check();

        Map<String, Double> gauges = reconciliation.gaugeValues();
        assertThat(gauges.get("order.credit.unanswered")).isEqualTo(2.0);
        assertThat(gauges.get("order.credit.unanswered.oldest.age")).isEqualTo(1200.0);
        assertThat(gauges.get("order.credit.timeout.unanswered")).isZero();
    }
}
