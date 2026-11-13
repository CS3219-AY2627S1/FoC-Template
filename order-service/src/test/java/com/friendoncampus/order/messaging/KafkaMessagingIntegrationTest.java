package com.friendoncampus.order.messaging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.awaitility.Awaitility.await;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;

import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.kafka.KafkaContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;

import com.friendoncampus.order.domain.OrderState;
import com.friendoncampus.order.repository.OutboxEventRepository;
import com.friendoncampus.order.service.CreateOrderCommand;
import com.friendoncampus.order.service.OrderService;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Order's Kafka adapters against a real broker and PostgreSQL (Testcontainers). Topics are created
 * here, as the shared kafka-init does in Compose. Requires Docker.
 */
@SpringBootTest(properties = {
        "app.orders.expiry.enabled=false",
        "app.kafka.enabled=true",
        "app.kafka.outbox.interval-ms=200",
        "spring.kafka.security.protocol=PLAINTEXT",
        "spring.kafka.properties.sasl.jaas.config=",
        "spring.kafka.properties.sasl.mechanism="
})
@Testcontainers
class KafkaMessagingIntegrationTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    @Container
    static final KafkaContainer KAFKA = new KafkaContainer("apache/kafka:4.1.0");

    private static final UUID REQUESTER = UUID.fromString("97947588-bb2e-42f2-91ba-9abf8e15a8e7");

    @DynamicPropertySource
    static void kafka(DynamicPropertyRegistry registry) {
        registry.add("spring.kafka.bootstrap-servers", KAFKA::getBootstrapServers);
    }

    @BeforeAll
    static void createTopics() throws Exception {
        try (AdminClient admin = AdminClient.create(Map.of("bootstrap.servers", KAFKA.getBootstrapServers()))) {
            admin.createTopics(List.of(
                    new NewTopic("order.events", 3, (short) 1),
                    new NewTopic("credit.events", 3, (short) 1),
                    new NewTopic("credit.events.DLT", 1, (short) 1))).all().get();
        }
    }

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @MockitoSpyBean
    private CreditOutcomeHandler creditOutcomeHandler;

    @Autowired
    private OrderService orderService;

    @Autowired
    private OutboxEventRepository outboxEventRepository;

    @Autowired
    private JdbcTemplate jdbc;

    private final JsonMapper json = JsonMapper.builder().build();

    private UUID createOrder() {
        return orderService.createOrder(new CreateOrderCommand(REQUESTER, "Collect printing", "Grab my printout",
                UUID.randomUUID(), "COM1 Print Shop", UUID.randomUUID(), "UTown Residence", 10,
                OffsetDateTime.now(ZoneOffset.UTC).plusHours(1))).getId();
    }

    /** Reads every record on {@code topic} until {@code done} matches, or times out. */
    private static List<ConsumerRecord<String, String>> readUntil(String topic,
            java.util.function.Predicate<List<ConsumerRecord<String, String>>> done) {
        Properties props = new Properties();
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, KAFKA.getBootstrapServers());
        props.put(ConsumerConfig.GROUP_ID_CONFIG, "test-reader-" + UUID.randomUUID());
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        List<ConsumerRecord<String, String>> seen = new ArrayList<>();
        try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props, new StringDeserializer(),
                new StringDeserializer())) {
            consumer.subscribe(List.of(topic));
            long until = System.currentTimeMillis() + 20_000;
            while (System.currentTimeMillis() < until && !done.test(seen)) {
                consumer.poll(Duration.ofMillis(300)).forEach(seen::add);
            }
        }
        return seen;
    }

    private static void publish(String topic, String key, String value) throws Exception {
        try (KafkaProducer<String, String> producer = new KafkaProducer<>(Map.<String, Object>of(
                ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, KAFKA.getBootstrapServers()),
                new StringSerializer(), new StringSerializer())) {
            producer.send(new ProducerRecord<>(topic, key, value)).get();
        }
    }

    private JsonNode submittedEvent(UUID orderId) {
        return json.readTree(outboxEventRepository.findByAggregateIdOrderByAggregateVersionAsc(orderId).get(0)
                .getPayload());
    }

    /** A blueprint CreditReserved answering the order's OrderSubmitted. */
    private String creditReserved(JsonNode submitted) {
        return creditOutcome(submitted, "CreditReserved", Map.of("reservationId", UUID.randomUUID().toString(),
                "amount", 10, "availableBalance", 0, "reservedBalance", 10));
    }

    private String creditOutcome(JsonNode submitted, String eventType, Map<String, Object> extraData) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("operationId", submitted.get("data").get("operationId").asString());
        data.put("orderId", submitted.get("aggregateId").asString());
        data.putAll(extraData);
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("eventId", UUID.randomUUID().toString());
        envelope.put("eventType", eventType);
        envelope.put("eventVersion", 1);
        envelope.put("aggregateType", "Order");
        envelope.put("aggregateId", submitted.get("aggregateId").asString());
        envelope.put("aggregateVersion", submitted.get("aggregateVersion").asLong());
        envelope.put("occurredAt", "2026-10-18T10:00:00Z");
        envelope.put("producer", "credit-service");
        envelope.put("correlationId", submitted.get("correlationId").asString());
        envelope.put("causationId", submitted.get("eventId").asString());
        envelope.put("actor", Map.of("type", "SYSTEM"));
        envelope.put("data", data);
        return json.writeValueAsString(envelope);
    }

    private OrderState state(UUID orderId) {
        return OrderState.valueOf(jdbc.queryForObject("select state from orders where id = ?", String.class, orderId));
    }

    @Test
    void aNewOrderIsPublishedToOrderEventsKeyedByOrderId() {
        UUID orderId = createOrder();
        String storedPayload = outboxEventRepository.findByAggregateIdOrderByAggregateVersionAsc(orderId).get(0)
                .getPayload();

        List<ConsumerRecord<String, String>> records = readUntil("order.events",
                seen -> seen.stream().anyMatch(record -> orderId.toString().equals(record.key())));
        ConsumerRecord<String, String> published = records.stream()
                .filter(record -> orderId.toString().equals(record.key())).findFirst().orElseThrow();

        assertThat(json.readTree(published.value())).isEqualTo(json.readTree(storedPayload));
        assertThat(json.readTree(published.value()).get("eventType").asString()).isEqualTo("OrderSubmitted");
        await().atMost(Duration.ofSeconds(10)).until(() -> jdbc.queryForObject(
                "select published_at is not null from outbox_events where aggregate_id = ?", Boolean.class, orderId));
    }

    @Test
    void creditReservedOnCreditEventsOpensTheOrder() throws Exception {
        UUID orderId = createOrder();

        publish("credit.events", orderId.toString(), creditReserved(submittedEvent(orderId)));

        await().atMost(Duration.ofSeconds(20)).until(() -> state(orderId) == OrderState.OPEN);
    }

    @Test
    void aRedeliveredCreditEventChangesNothingMore() throws Exception {
        UUID orderId = createOrder();
        String event = creditReserved(submittedEvent(orderId));

        publish("credit.events", orderId.toString(), event);
        publish("credit.events", orderId.toString(), event);

        await().atMost(Duration.ofSeconds(20)).until(() -> state(orderId) == OrderState.OPEN);
        String eventId = json.readTree(event).get("eventId").asString();
        await().during(Duration.ofSeconds(2)).atMost(Duration.ofSeconds(10)).until(() -> jdbc.queryForObject(
                "select count(*) from processed_events where event_id = ?::uuid", Integer.class, eventId) == 1);
        assertThat(jdbc.queryForObject("select count(*) from order_transitions where order_id = ? and action = 'OPEN'",
                Integer.class, orderId)).isEqualTo(1);
    }

    @Test
    void aContractViolatingEventGoesToTheDeadLetterTopic() throws Exception {
        String key = UUID.randomUUID().toString();
        publish("credit.events", key, "{\"eventId\":\"not-a-uuid\",\"eventType\":\"CreditReserved\"}");

        List<ConsumerRecord<String, String>> dlt = readUntil("credit.events.DLT",
                seen -> seen.stream().anyMatch(record -> key.equals(record.key())));

        assertThat(dlt).anyMatch(record -> key.equals(record.key()) && record.value().contains("not-a-uuid"));
    }

    @Test
    void anOutcomeTheOrderCannotTakeGoesToTheDeadLetterTopicWithoutRetries() throws Exception {
        UUID orderId = createOrder();
        JsonNode submitted = submittedEvent(orderId);
        orderService.confirmReservation(orderId, UUID.randomUUID());
        // A rejection for an order that is already OPEN fails the same way on every attempt.
        String rejected = creditOutcome(submitted, "CreditReservationRejected", Map.of("reasonCode", "REQUEST_CONFLICT"));
        String eventId = json.readTree(rejected).get("eventId").asString();
        publish("credit.events", orderId.toString(), rejected);

        List<ConsumerRecord<String, String>> dlt = readUntil("credit.events.DLT",
                seen -> seen.stream().anyMatch(record -> record.value().contains(eventId)));

        assertThat(dlt).anyMatch(record -> record.value().contains(eventId));
        // Retrying would call the handler 4 times over about 3.5 s of backoff; it ran once.
        verify(creditOutcomeHandler, times(1)).handle(argThat(value -> value != null && value.contains(eventId)));
        assertThat(state(orderId)).isEqualTo(OrderState.OPEN);
    }
}
