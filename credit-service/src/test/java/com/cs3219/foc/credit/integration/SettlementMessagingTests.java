package com.cs3219.foc.credit.integration;

import static org.assertj.core.api.Assertions.*;
import static org.awaitility.Awaitility.await;

import com.cs3219.foc.credit.model.dto.ReserveCreditRequest;
import com.cs3219.foc.credit.model.dto.event.*;
import com.cs3219.foc.credit.service.*;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import software.amazon.awssdk.services.sns.SnsClient;
import software.amazon.awssdk.services.sns.model.MessageAttributeValue;
import software.amazon.awssdk.services.sqs.SqsAsyncClient;
import software.amazon.awssdk.services.sqs.model.*;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest
@Import(AbstractIntegrationTest.Aws.class)
class SettlementMessagingTests extends AbstractIntegrationTest {
    @Autowired
    SnsClient sns;

    @Autowired
    SqsAsyncClient sqs;

    @Autowired
    CreditAccountService creditAccountService;

    @Autowired
    CreditReservationService reservations;

    @Autowired
    CreditRefundService refund;

    @Autowired
    JdbcTemplate sql;

    @Test
    void malformedMessagesParkInDlqAndRedeliveryDoesNotRepeatSettlement() {
        var orderQueue = sqs.getQueueUrl(r -> r.queueName("foc-test-order-events"))
                .join()
                .queueUrl();
        var creditQueue = sqs.getQueueUrl(r -> r.queueName("foc-test-credit-events"))
                .join()
                .queueUrl();
        var deadLetterQueue =
                sqs.getQueueUrl(r -> r.queueName("foc-test-credit-dlq")).join().queueUrl();
        var dlqArn = sqs.getQueueAttributes(
                        r -> r.queueUrl(deadLetterQueue).attributeNames(QueueAttributeName.QUEUE_ARN))
                .join()
                .attributes()
                .get(QueueAttributeName.QUEUE_ARN);
        // Short redelivery timings belong to this poison-message scenario only.
        sqs.setQueueAttributes(r -> r.queueUrl(creditQueue)
                        .attributes(Map.of(
                                QueueAttributeName.VISIBILITY_TIMEOUT,
                                "1",
                                QueueAttributeName.REDRIVE_POLICY,
                                "{\"deadLetterTargetArn\":\"" + dlqArn + "\",\"maxReceiveCount\":3}")))
                .join();
        var owner = UUID.randomUUID();
        var courier = UUID.randomUUID();
        creditAccountService.initializeAccount(owner);
        sql.update("UPDATE credit_accounts SET total_balance=100 WHERE user_id=?", owner);
        var cancelled = cancelled(owner, 20);
        var expired = new ErrandExpiredEvent(
                UUID.randomUUID(),
                1,
                OffsetDateTime.now(),
                new ErrandExpiredEvent.Payload(reserved(owner, 20), owner, 20));
        var completed = new ErrandCompletedEvent(
                UUID.randomUUID(),
                1,
                OffsetDateTime.now(),
                new ErrandCompletedEvent.Payload(reserved(owner, 40), owner, 40, courier));
        var invalidAmounts = List.of("1.9", "1.0", "1e2", "9223372036854775808", "-9223372036854775809");
        var body = JsonMapper.builder().build().writeValueAsString(cancelled);
        for (var amount : invalidAmounts) {
            publishOrderBody(ErrandCancelledEvent.TYPE, body.replace("\"amount\":20", "\"amount\":" + amount));
        }
        await().atMost(Duration.ofSeconds(30))
                .untilAsserted(() -> assertThat(deadLetters(deadLetterQueue)).isEqualTo(invalidAmounts.size()));
        await().atMost(Duration.ofSeconds(15)).until(() -> {
            for (var message : receive(deadLetterQueue)) delete(deadLetterQueue, message);
            return deadLetters(deadLetterQueue) == 0;
        });
        assertThat(creditAccountService.getBalance(owner).reservedBalance()).isEqualTo(80);
        assertThat(sql.queryForObject("SELECT count(*) FROM credit_transaction_log", Long.class))
                .isEqualTo(3);
        publishOrderEvent(ErrandCancelledEvent.TYPE, cancelled);
        publishOrderEvent(ErrandExpiredEvent.TYPE, expired);
        publishOrderEvent(ErrandCompletedEvent.TYPE, completed);
        await().atMost(Duration.ofSeconds(20)).untilAsserted(() -> {
            assertThat(sql.queryForObject(
                            "SELECT count(*) FROM credit_reservations WHERE state='REFUNDED'", Long.class))
                    .isEqualTo(2);
            assertThat(deadLetters(deadLetterQueue)).isEqualTo(1);
        });
        assertThat(creditAccountService.getBalance(owner).reservedBalance()).isEqualTo(40);
        assertThat(sql.queryForObject("SELECT count(*) FROM credit_transaction_log", Long.class))
                .isEqualTo(5);
        creditAccountService.initializeAccount(courier);
        var parked = receive(deadLetterQueue).getFirst();
        sqs.sendMessage(r -> r.queueUrl(creditQueue)
                        .messageBody(parked.body())
                        .messageAttributes(parked.messageAttributes()))
                .join();
        delete(deadLetterQueue, parked);
        await().atMost(Duration.ofSeconds(20)).untilAsserted(() -> assertThat(
                        creditAccountService.getBalance(courier).availableBalance())
                .isEqualTo(55));
        var originalResultId = awaitPayoutResult(orderQueue, completed.eventId(), null);
        // Acknowledging a duplicate must not transfer credits again.
        publishOrderEvent(ErrandCompletedEvent.TYPE, completed);
        awaitPayoutResult(orderQueue, completed.eventId(), originalResultId);
        await().atMost(Duration.ofSeconds(20)).untilAsserted(() -> assertThat(sql.queryForObject(
                        "SELECT count(*) FROM event_publication WHERE completion_date IS NULL", Long.class))
                .isZero());
        assertThat(sql.queryForObject("SELECT count(*) FROM credit_transaction_log", Long.class))
                .isEqualTo(6);
        assertThat(creditAccountService.getBalance(courier).availableBalance()).isEqualTo(55);
        // Registry writes are part of the same transaction as settlement and its audit row.
        var rolledBack = cancelled(owner, 10);
        sql.execute("ALTER TABLE event_publication ADD CONSTRAINT fail_publication CHECK(FALSE) NOT VALID");
        try {
            assertThatThrownBy(() -> refund.releaseReservedCredits(rolledBack)).isInstanceOf(RuntimeException.class);
            assertThat(creditAccountService.getBalance(owner).reservedBalance()).isEqualTo(10);
            assertThat(sql.queryForObject(
                            "SELECT count(*) FROM credit_transaction_log WHERE operation_id=?",
                            Long.class,
                            rolledBack.eventId()))
                    .isZero();
        } finally {
            sql.execute("ALTER TABLE event_publication DROP CONSTRAINT fail_publication");
        }
    }

    private UUID reserved(UUID owner, long amount) {
        var request = new ReserveCreditRequest(UUID.randomUUID(), UUID.randomUUID(), amount);
        assertThat(reservations.reserve(owner, request).outcome()).isEqualTo("RESERVED");
        return request.errandId();
    }

    private UUID awaitPayoutResult(String queue, UUID operationId, UUID previousResultId) {
        var json = JsonMapper.builder().build();
        // Result messages are emitted after the settlement transaction commits, including duplicate decisions.
        var result = await().atMost(Duration.ofSeconds(20))
                .until(
                        () -> {
                            var messages = receive(queue);
                            for (var message : messages) {
                                delete(queue, message);
                                var event = json.readTree(message.body());
                                if (event.path("payload")
                                                .path("operationId")
                                                .asText()
                                                .equals(operationId.toString())
                                        && !event.path("eventId").asText().equals(String.valueOf(previousResultId))) {
                                    assertThat(message.messageAttributes()
                                                    .get("eventType")
                                                    .stringValue())
                                            .isEqualTo(CreditPaidEvent.TYPE);
                                    return event;
                                }
                            }
                            return null;
                        },
                        Objects::nonNull);
        assertThat(result.get("payload").has("outcome")).isFalse();
        assertThat(result.get("payload").get("courierId").asText()).isNotBlank();
        return UUID.fromString(result.get("eventId").asText());
    }

    private ErrandCancelledEvent cancelled(UUID owner, long amount) {
        return new ErrandCancelledEvent(
                UUID.randomUUID(),
                1,
                OffsetDateTime.now(),
                new ErrandCancelledEvent.Payload(reserved(owner, amount), owner, amount));
    }

    private void publishOrderEvent(String type, Object event) {
        publishOrderBody(type, JsonMapper.builder().build().writeValueAsString(event));
    }

    private void publishOrderBody(String type, String body) {
        sns.publish(r -> r.topicArn("arn:aws:sns:ap-southeast-1:000000000000:foc-test-order-events")
                .message(body)
                .messageAttributes(Map.of(
                        "eventType",
                        MessageAttributeValue.builder()
                                .dataType("String")
                                .stringValue(type)
                                .build())));
    }

    private int deadLetters(String queue) {
        return Integer.parseInt(sqs.getQueueAttributes(
                        r -> r.queueUrl(queue).attributeNames(QueueAttributeName.APPROXIMATE_NUMBER_OF_MESSAGES))
                .join()
                .attributes()
                .get(QueueAttributeName.APPROXIMATE_NUMBER_OF_MESSAGES));
    }

    private List<Message> receive(String url) {
        return sqs.receiveMessage(r -> r.queueUrl(url)
                        .waitTimeSeconds(1)
                        .maxNumberOfMessages(10)
                        .messageAttributeNames("All"))
                .join()
                .messages();
    }

    private void delete(String url, Message message) {
        sqs.deleteMessage(r -> r.queueUrl(url).receiptHandle(message.receiptHandle()))
                .join();
    }
}
