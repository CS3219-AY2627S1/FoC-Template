package com.friendoncampus.notification.messaging;

import static com.friendoncampus.notification.messaging.CreditEvents.json;
import static com.friendoncampus.notification.messaging.CreditEvents.settled;
import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import java.util.function.Predicate;

import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.header.Header;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.support.KafkaHeaders;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.kafka.KafkaContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * The {@code credit.events} and {@code order.lifecycle.events} listeners against a real broker and
 * PostgreSQL (Testcontainers). Topics
 * are created here, as the shared kafka-init does in Compose. Requires Docker.
 */
@SpringBootTest(properties = {
        "app.kafka.enabled=true",
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
    private static final UUID COURIER = UUID.fromString("5b0f3c1e-8a52-4f8e-9d37-2c1b6e4a7f10");

    @DynamicPropertySource
    static void kafka(DynamicPropertyRegistry registry) {
        registry.add("spring.kafka.bootstrap-servers", KAFKA::getBootstrapServers);
    }

    @BeforeAll
    static void createTopics() throws Exception {
        try (AdminClient admin = AdminClient.create(Map.of("bootstrap.servers", KAFKA.getBootstrapServers()))) {
            admin.createTopics(List.of(
                    new NewTopic("credit.events", 3, (short) 1),
                    new NewTopic("credit.events.DLT", 1, (short) 1),
                    new NewTopic("order.lifecycle.events", 3, (short) 1),
                    new NewTopic("order.lifecycle.events.DLT", 1, (short) 1),
                    new NewTopic("chat.events", 3, (short) 1),
                    new NewTopic("chat.events.DLT", 1, (short) 1))).all().get();
        }
    }

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @Autowired
    private JdbcTemplate jdbc;

    private static void publish(String key, String value) throws Exception {
        publish("credit.events", key, value);
    }

    private static void publish(String topic, String key, String value) throws Exception {
        try (KafkaProducer<String, String> producer = new KafkaProducer<>(Map.<String, Object>of(
                ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, KAFKA.getBootstrapServers()),
                new StringSerializer(), new StringSerializer())) {
            producer.send(new ProducerRecord<>(topic, key, value)).get();
        }
    }

    /** Reads every record on {@code topic} until {@code done} matches, or times out. */
    private static List<ConsumerRecord<String, String>> readUntil(String topic,
            Predicate<List<ConsumerRecord<String, String>>> done) {
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

    private int notificationsFor(UUID orderId) {
        return jdbc.queryForObject("select count(*) from notifications where order_id = ?", Integer.class, orderId);
    }

    private boolean handled(Object eventId) {
        return jdbc.queryForObject("select count(*) from notification_inbox where event_id = ?::uuid",
                Integer.class, eventId.toString()) == 1;
    }

    @Test
    void aSettledOrderOnCreditEventsNotifiesTheCourier() throws Exception {
        UUID orderId = UUID.randomUUID();

        publish(orderId.toString(), json(settled(orderId, REQUESTER, COURIER, 3)));

        await().atMost(Duration.ofSeconds(20)).until(() -> notificationsFor(orderId) == 1);
        assertThat(jdbc.queryForObject("select recipient_id from notifications where order_id = ?", UUID.class,
                orderId)).isEqualTo(COURIER);
    }

    @Test
    void aRedeliveredEventStillNotifiesOnce() throws Exception {
        UUID orderId = UUID.randomUUID();
        Map<String, Object> event = settled(orderId, REQUESTER, COURIER, 3);

        publish(orderId.toString(), json(event));
        publish(orderId.toString(), json(event));
        // A later event on the same key and partition proves both copies were consumed.
        Map<String, Object> marker = CreditEvents.reserved(orderId);
        publish(orderId.toString(), json(marker));

        await().atMost(Duration.ofSeconds(20)).until(() -> handled(marker.get("eventId")));
        assertThat(notificationsFor(orderId)).isEqualTo(1);
    }

    @Test
    void anEventBreakingTheContractGoesStraightToTheDltWithItsKey() throws Exception {
        UUID orderId = UUID.randomUUID();
        Map<String, Object> event = settled(orderId, REQUESTER, COURIER, 3);
        CreditEvents.data(event).remove("courierId");

        publish(orderId.toString(), json(event));

        List<ConsumerRecord<String, String>> dlt = readUntil("credit.events.DLT",
                seen -> seen.stream().anyMatch(record -> orderId.toString().equals(record.key())));
        ConsumerRecord<String, String> deadLetter = dlt.stream()
                .filter(record -> orderId.toString().equals(record.key())).findFirst().orElseThrow();
        assertThat(deadLetter.value()).isEqualTo(json(event));
        Header group = deadLetter.headers().lastHeader(KafkaHeaders.DLT_ORIGINAL_CONSUMER_GROUP);
        assertThat(new String(group.value(), StandardCharsets.UTF_8)).isEqualTo("notification-service");
        assertThat(notificationsFor(orderId)).isZero();
        assertThat(handled(event.get("eventId"))).isFalse();
    }

    @Test
    void anAcceptedErrandOnOrderLifecycleEventsNotifiesTheRequester() throws Exception {
        OrderEvents.Errand errand = OrderEvents.Errand.create(REQUESTER);
        Map<String, Object> accepted = OrderEvents.transition(errand, 3, "ACCEPT", "OPEN", "ACCEPTED",
                OrderEvents.user(COURIER, "COURIER"), null, COURIER, null);

        publish("order.lifecycle.events", errand.orderId().toString(), OrderEvents.json(accepted));

        await().atMost(Duration.ofSeconds(20)).until(() -> notificationsFor(errand.orderId()) == 1);
        assertThat(jdbc.queryForObject("select recipient_id from notifications where order_id = ?", UUID.class,
                errand.orderId())).isEqualTo(REQUESTER);
    }

    @Test
    void aBrokenLifecycleEventGoesToItsOwnDltWithItsKey() throws Exception {
        OrderEvents.Errand errand = OrderEvents.Errand.create(REQUESTER);
        Map<String, Object> event = OrderEvents.transition(errand, 3, "ACCEPT", "OPEN", "ACCEPTED",
                OrderEvents.user(COURIER, "COURIER"), null, COURIER, null);
        OrderEvents.data(event).remove("requesterId");

        publish("order.lifecycle.events", errand.orderId().toString(), OrderEvents.json(event));

        List<ConsumerRecord<String, String>> dlt = readUntil("order.lifecycle.events.DLT",
                seen -> seen.stream().anyMatch(record -> errand.orderId().toString().equals(record.key())));
        ConsumerRecord<String, String> deadLetter = dlt.stream()
                .filter(record -> errand.orderId().toString().equals(record.key())).findFirst().orElseThrow();
        assertThat(deadLetter.value()).isEqualTo(OrderEvents.json(event));
        Header group = deadLetter.headers().lastHeader(KafkaHeaders.DLT_ORIGINAL_CONSUMER_GROUP);
        assertThat(new String(group.value(), StandardCharsets.UTF_8)).isEqualTo("notification-service");
        assertThat(notificationsFor(errand.orderId())).isZero();
    }

    @Test
    void aChatMessageNotifiesItsRecipientAndARepeatDoesNotDuplicateIt() throws Exception {
        UUID orderId=UUID.randomUUID(),conversationId=UUID.randomUUID(),messageId=UUID.randomUUID();
        String event=chatEvent(UUID.randomUUID(),conversationId,orderId,messageId,REQUESTER,COURIER,"TEXT");

        publish("chat.events",conversationId.toString(),event);
        publish("chat.events",conversationId.toString(),event);

        await().atMost(Duration.ofSeconds(20)).until(() -> notificationsFor(orderId)==1);
        assertThat(jdbc.queryForObject("SELECT recipient_id FROM notifications WHERE order_id=?",UUID.class,orderId))
                .isEqualTo(COURIER);
        assertThat(jdbc.queryForObject("SELECT type FROM notifications WHERE order_id=?",String.class,orderId))
                .isEqualTo("CHAT_MESSAGE_RECEIVED");
    }

    @Test
    void aChatEventWithTheWrongKeyGoesToItsOwnDlt() throws Exception {
        UUID orderId=UUID.randomUUID(),conversationId=UUID.randomUUID();
        String wrongKey=UUID.randomUUID().toString();
        String event=chatEvent(UUID.randomUUID(),conversationId,orderId,UUID.randomUUID(),REQUESTER,COURIER,"IMAGE");

        publish("chat.events",wrongKey,event);

        List<ConsumerRecord<String,String>> dlt=readUntil("chat.events.DLT",
                seen->seen.stream().anyMatch(record->wrongKey.equals(record.key())));
        assertThat(dlt).anySatisfy(record->{
            assertThat(record.key()).isEqualTo(wrongKey);
            assertThat(record.value()).isEqualTo(event);
        });
        assertThat(notificationsFor(orderId)).isZero();
    }

    private static String chatEvent(UUID eventId,UUID conversationId,UUID orderId,UUID messageId,
            UUID senderId,UUID recipientId,String messageType) {
        return """
                {"eventId":"%s","eventType":"ChatMessageSent","eventVersion":1,
                "aggregateType":"Conversation","aggregateId":"%s","aggregateVersion":1,
                "occurredAt":"2026-11-10T06:00:00Z","producer":"chat-service",
                "correlationId":"%s","causationId":"%s",
                "actor":{"type":"USER","userId":"%s"},
                "data":{"messageId":"%s","conversationId":"%s","orderId":"%s",
                "senderUserId":"%s","recipientUserId":"%s","messageType":"%s"}}
                """.formatted(eventId,conversationId,orderId,messageId,senderId,messageId,conversationId,
                        orderId,senderId,recipientId,messageType).replaceAll("\\s+","");
    }
}
