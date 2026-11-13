package com.cs3219.foc.e2e;

import static org.assertj.core.api.Assertions.*;
import static org.awaitility.Awaitility.await;

import com.microsoft.playwright.APIRequest.NewContextOptions;
import com.microsoft.playwright.Playwright;
import com.microsoft.playwright.options.RequestOptions;
import java.net.URI;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.testcontainers.DockerClientFactory;
import software.amazon.awssdk.auth.credentials.*;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sns.SnsClient;
import software.amazon.awssdk.services.sns.model.MessageAttributeValue;
import software.amazon.awssdk.services.sqs.model.QueueAttributeName;
import tools.jackson.databind.JsonNode;

class ServiceFlowsTests extends AbstractEndToEndTest {
    @AutoClose
    private SnsClient sns;

    @BeforeAll
    void createMessagingClients() {
        var endpoint = URI.create("http://" + host("floci", 4566) + ":" + port("floci", 4566));
        var credentials = StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test"));
        sns = SnsClient.builder()
                .endpointOverride(endpoint)
                .region(Region.AP_SOUTHEAST_1)
                .credentialsProvider(credentials)
                .build();
    }

    @AfterEach
    void restoreNetwork() {
        var response = api.post("http://" + host("toxiproxy", 8474) + ":" + port("toxiproxy", 8474) + "/reset");
        assertThat(response.ok()).isTrue();
    }

    private String observePublishedContracts() {
        var observations = sqs.createQueue(r -> r.queueName("foc-e2e-observations-" + UUID.randomUUID()))
                .queueUrl();
        var arn = sqs.getQueueAttributes(r -> r.queueUrl(observations).attributeNames(QueueAttributeName.QUEUE_ARN))
                .attributes()
                .get(QueueAttributeName.QUEUE_ARN);
        sqs.setQueueAttributes(r -> r.queueUrl(observations)
                .attributes(Map.of(
                        QueueAttributeName.POLICY,
                        json.writeValueAsString(Map.of(
                                "Version",
                                "2012-10-17",
                                "Statement",
                                List.of(Map.of(
                                        "Effect",
                                        "Allow",
                                        "Principal",
                                        Map.of("Service", "sns.amazonaws.com"),
                                        "Action",
                                        "sqs:SendMessage",
                                        "Resource",
                                        arn,
                                        "Condition",
                                        Map.of(
                                                "ArnEquals",
                                                Map.of(
                                                        "aws:SourceArn",
                                                        List.of(
                                                                topic("user"),
                                                                topic("order"),
                                                                topic("credit")))))))))));
        for (var service : List.of("user", "order", "credit"))
            sns.subscribe(r -> r.topicArn(topic(service))
                    .protocol("sqs")
                    .endpoint(arn)
                    .attributes(Map.of("RawMessageDelivery", "true")));
        return observations;
    }

    private void deleteObservationQueue(String observations) {
        var arn = sqs.getQueueAttributes(r -> r.queueUrl(observations).attributeNames(QueueAttributeName.QUEUE_ARN))
                .attributes()
                .get(QueueAttributeName.QUEUE_ARN);
        for (var subscription : sns.listSubscriptionsPaginator().subscriptions())
            if (arn.equals(subscription.endpoint()))
                sns.unsubscribe(r -> r.subscriptionArn(subscription.subscriptionArn()));
        sqs.deleteQueue(r -> r.queueUrl(observations));
    }

    @Test
    void registrationProvisionsCreditsAndRejectsUnauthenticatedAccess() {
        var user = register("New student");
        awaitBalance(user, 15);
        request("GET", "/api/credits/me", null, null, 401);
        request("GET", "/api/credits/me?userId=" + UUID.randomUUID(), user.token(), null, 200);
        assertThat(sql("credits")
                        .queryForObject("SELECT count(*) FROM credit_accounts WHERE user_id=?", Long.class, user.id()))
                .isEqualTo(1);
    }

    @Test
    void userPublicationRecoversAfterRestartWithItsOriginalIdentity() {
        publisherAvailable("user", false);
        var user = register("Offline publisher");
        var eventId = sql("users")
                .queryForObject(
                        "SELECT serialized_event::jsonb->>'eventId' FROM event_publication "
                                + "WHERE serialized_event::jsonb->'payload'->>'userId'=?",
                        String.class,
                        user.id().toString());
        assertThat(eventId).isNotBlank();
        restart("user-service", 8080);
        publisherAvailable("user", true);
        awaitBalance(user, 15);
        await().pollInSameThread().atMost(Duration.ofSeconds(20)).untilAsserted(() -> assertThat(sql("users")
                        .queryForObject(
                                "SELECT count(*) FROM event_publication WHERE serialized_event::jsonb->>'eventId'=?",
                                Long.class,
                                eventId))
                .isZero());
        // Duplicate delivery through the real consumer must preserve an existing balance.
        sql("credits").update("UPDATE credit_accounts SET total_balance=9 WHERE user_id=?", user.id());
        sns.publish(r -> r.topicArn(topic("user"))
                .message(json.writeValueAsString(Map.of(
                        "eventId",
                        eventId,
                        "schemaVersion",
                        1,
                        "occurredAt",
                        OffsetDateTime.now().toString(),
                        "payload",
                        Map.of("userId", user.id()))))
                .messageAttributes(Map.of("eventType", attribute("UserCreatedEvent"), "eventId", attribute(eventId))));
        var queue = sqs.getQueueUrl(r -> r.queueName("foc-e2e-credit-events")).queueUrl();
        await().pollInSameThread()
                .during(Duration.ofSeconds(1))
                .atMost(Duration.ofSeconds(20))
                .untilAsserted(() -> {
                    var counts = sqs.getQueueAttributes(r -> r.queueUrl(queue)
                                    .attributeNames(
                                            QueueAttributeName.APPROXIMATE_NUMBER_OF_MESSAGES,
                                            QueueAttributeName.APPROXIMATE_NUMBER_OF_MESSAGES_NOT_VISIBLE))
                            .attributes();
                    assertThat(counts.values()).allMatch("0"::equals);
                    awaitBalance(user, 9);
                });
    }

    @Test
    void orderCreationReusesItsRequestAndUsesRealSupplierAndUserLookups() {
        var supplier = supplier(admin());
        var requester = register("Requester");
        awaitBalance(requester, 15);
        var key = UUID.randomUUID();
        var body = creation(supplier, key, 5);
        var created = request("POST", "/api/orders", requester.token(), body, 200);
        var id = UUID.fromString(created.get("errandId").asString());
        awaitOrder(id, "OPEN", "RESERVED");
        assertThat(request("POST", "/api/orders", requester.token(), body, 200)
                        .get("errandId")
                        .asString())
                .isEqualTo(id.toString());
        request("POST", "/api/orders", requester.token(), creation(supplier, key, 6), 409);
        var details = request("GET", "/api/orders/" + id, requester.token(), null, 200);
        assertThat(details.at("/pickup/address").asString()).isEqualTo("COM3, 1, Stall 2");
        assertThat(details.at("/requester/name").asString()).isEqualTo("Requester");
        awaitBalance(requester, 10);
        assertThat(sql("credits")
                        .queryForObject("SELECT count(*) FROM credit_reservations WHERE errand_id=?", Long.class, id))
                .isEqualTo(1);
    }

    @Test
    void completedOrderPaysTheCourierAfterPickupAndRequesterConfirmation() {
        var observations = observePublishedContracts();
        try {
            var supplier = supplier(admin());
            var requester = register("Requester");
            var courier = register("Courier");
            awaitBalance(requester, 15);
            awaitBalance(courier, 15);
            var id = create(requester, supplier, 5);
            request("POST", "/api/orders/" + id + "/accept", courier.token(), null, 200);
            // The chat opens once a courier accepts.
            say(id, requester, "Less ice please", 200);
            var gotIt = say(id, courier, "Got it", 200);
            assertThat(sendChatPhoto(id, courier.token(), 200)
                            .get("attachment")
                            .get("type")
                            .asString())
                    .isEqualTo("IMAGE");
            request(
                    "POST",
                    "/api/orders/" + id + "/messages/read",
                    requester.token(),
                    Map.of("messageId", gotIt.get("id").asString()),
                    204);
            request("POST", "/api/orders/" + id + "/complete", requester.token(), null, 409);
            request("POST", "/api/orders/" + id + "/pick-up", courier.token(), null, 200);
            // The requester can only confirm after the courier has delivered it with a photo.
            request("POST", "/api/orders/" + id + "/complete", requester.token(), null, 409);
            deliver(id, requester.token(), 403);
            assertThat(deliver(id, courier.token(), 200).get("status").asString())
                    .isEqualTo("DELIVERED");
            // Both photos were submitted together; after that they are fixed.
            var photos = request("GET", "/api/orders/" + id + "/delivery-photos", requester.token(), null, 200);
            assertThat(photos.size()).isEqualTo(2);
            assertThat(photos.get(0).get("url").asString()).contains("delivery-photos/" + id + "/");
            deliver(id, courier.token(), 409);
            request("POST", "/api/orders/" + id + "/complete", courier.token(), null, 403);
            request("POST", "/api/orders/" + id + "/complete", requester.token(), null, 200);
            // after confirmation the chat is read-only
            say(id, requester, "Thanks!", 409);
            var chat = request("GET", "/api/orders/" + id + "/messages", courier.token(), null, 200);
            assertThat(chat.get("messages").size()).isEqualTo(3);
            assertThat(chat.get("messages").get(0).get("body").asString()).isEqualTo("Less ice please");
            assertThat(chat.get("messages").get(2).get("attachment").get("url").asString())
                    .contains("chat/" + id + "/");
            assertThat(chat.get("reads").get(0).get("userId").asString())
                    .isEqualTo(requester.id().toString());
            awaitOrder(id, "COMPLETED", "SETTLED");
            awaitBalance(requester, 10);
            awaitBalance(courier, 20);
            assertThat(sql("credits")
                            .queryForObject(
                                    "SELECT count(*) FROM credit_transaction_log WHERE errand_id=?", Long.class, id))
                    .isEqualTo(2);
            assertPublishedContracts(
                    observations,
                    "UserCreatedEvent",
                    "ErrandMessagePostedEvent",
                    "ErrandChatReadEvent",
                    "ErrandCompletedEvent",
                    "CreditPaidEvent");
        } finally {
            deleteObservationQueue(observations);
        }
    }

    @Test
    void repeatedCompletionRequestDoesNotPayTwice() {
        var supplier = supplier(admin());
        var requester = register("Requester");
        var courier = register("Courier");
        awaitBalance(requester, 15);
        awaitBalance(courier, 15);
        var id = completeOrder(requester, courier, supplier, 5);
        request("POST", "/api/orders/" + id + "/complete", requester.token(), null, 200);
        awaitBalance(requester, 10);
        awaitBalance(courier, 20);
        assertThat(sql("credits")
                        .queryForObject(
                                "SELECT count(*) FROM credit_transaction_log WHERE errand_id=?", Long.class, id))
                .isEqualTo(2);
    }

    @Test
    void duplicateCompletionEventDoesNotPayTwice() {
        var supplier = supplier(admin());
        var requester = register("Requester");
        var courier = register("Courier");
        awaitBalance(requester, 15);
        awaitBalance(courier, 15);
        var id = completeOrder(requester, courier, supplier, 5);
        var completionId =
                sql("orders").queryForObject("SELECT settlement_event_id FROM errands WHERE id=?", UUID.class, id);
        sns.publish(r -> r.topicArn(topic("order"))
                .message(json.writeValueAsString(Map.of(
                        "eventId",
                        completionId,
                        "schemaVersion",
                        1,
                        "occurredAt",
                        OffsetDateTime.now().toString(),
                        "payload",
                        Map.of("errandId", id, "requesterId", requester.id(), "courierId", courier.id(), "amount", 5))))
                .messageAttributes(Map.of(
                        "eventType",
                        attribute("ErrandCompletedEvent"),
                        "eventId",
                        attribute(completionId.toString()))));
        awaitMessagingIdle();
        awaitBalance(requester, 10);
        awaitBalance(courier, 20);
        assertThat(sql("credits")
                        .queryForObject(
                                "SELECT count(*) FROM credit_transaction_log WHERE errand_id=?", Long.class, id))
                .isEqualTo(2);
    }

    @Test
    void cancelledOrderRefundsItsReservation() {
        var observations = observePublishedContracts();
        try {
            var supplier = supplier(admin());
            var requester = register("Requester cancelling an order");
            awaitBalance(requester, 15);
            var id = create(requester, supplier, 3);
            awaitBalance(requester, 12);
            request("POST", "/api/orders/" + id + "/cancel", requester.token(), null, 200);
            awaitOrder(id, "CANCELLED", "RELEASED");
            awaitBalance(requester, 15);
            assertPublishedContracts(observations, "UserCreatedEvent", "ErrandCancelledEvent", "CreditRefundedEvent");
        } finally {
            deleteObservationQueue(observations);
        }
    }

    @Test
    void expiredOrderRefundsItsReservation() {
        var observations = observePublishedContracts();
        try {
            var supplier = supplier(admin());
            var requester = register("Requester with an expired order");
            awaitBalance(requester, 15);
            var id = create(requester, supplier, 4);
            awaitBalance(requester, 11);
            sql("orders").update("UPDATE errands SET expires_at=created_at + interval '1 millisecond' WHERE id=?", id);
            awaitOrder(id, "EXPIRED", "RELEASED");
            awaitBalance(requester, 15);
            assertPublishedContracts(observations, "UserCreatedEvent", "ErrandExpiredEvent", "CreditRefundedEvent");
        } finally {
            deleteObservationQueue(observations);
        }
    }

    @Test
    void pendingRequesterProvisioningRejectsCreationThenRecovers() {
        var supplier = supplier(admin());
        publisherAvailable("user", false);
        var user = register("Waiting for credits");
        var body = creation(supplier, UUID.randomUUID(), 5);
        assertThat(request("POST", "/api/orders", user.token(), body, 409)
                        .get("code")
                        .asString())
                .isEqualTo("CREDIT_ACCOUNT_PENDING");
        publisherAvailable("user", true);
        awaitBalance(user, 15);
        var id = UUID.fromString(request("POST", "/api/orders", user.token(), body, 200)
                .get("errandId")
                .asString());
        awaitOrder(id, "OPEN", "RESERVED");
    }

    @Test
    void pendingCourierProvisioningRejectsAcceptanceThenRecovers() {
        var supplier = supplier(admin());
        var requester = register("Requester");
        awaitBalance(requester, 15);
        var id = create(requester, supplier, 5);
        publisherAvailable("user", false);
        var courier = register("Courier waiting for credits");
        assertThat(request("POST", "/api/orders/" + id + "/accept", courier.token(), null, 409)
                        .get("code")
                        .asString())
                .isEqualTo("CREDIT_ACCOUNT_PENDING");
        assertThat(sql("orders").queryForObject("SELECT courier_id FROM errands WHERE id=?", UUID.class, id))
                .isNull();
        publisherAvailable("user", true);
        awaitBalance(courier, 15);
        request("POST", "/api/orders/" + id + "/accept", courier.token(), null, 200);
        awaitOrder(id, "ACCEPTED", "RESERVED");
    }

    @Test
    void courierWithNoAvailableCreditsCanCompleteAnOrder() {
        var supplier = supplier(admin());
        var requester = register("Requester");
        var courier = register("Courier without available credits");
        awaitBalance(requester, 15);
        awaitBalance(courier, 15);
        sql("credits").update("UPDATE credit_accounts SET total_balance=0 WHERE user_id=?", courier.id());
        completeOrder(requester, courier, supplier, 5);
        awaitBalance(requester, 10);
        awaitBalance(courier, 5);
    }

    @Test
    void publicationOutagesAndCreditRestartDoNotRepeatPayment() {
        var supplier = supplier(admin());
        var requester = register("Resilient requester");
        var courier = register("Resilient courier");
        awaitBalance(requester, 15);
        awaitBalance(courier, 15);
        var id = create(requester, supplier, 5);
        request("POST", "/api/orders/" + id + "/accept", courier.token(), null, 200);
        request("POST", "/api/orders/" + id + "/pick-up", courier.token(), null, 200);
        deliver(id, courier.token(), 200);
        publisherAvailable("order", false);
        request("POST", "/api/orders/" + id + "/complete", requester.token(), null, 200);
        awaitFailedPublication("orders", "order-completed", id);
        publisherAvailable("credit", false);
        publisherAvailable("order", true);
        awaitFailedPublication("credits", "credit-paid", id);
        awaitBalance(courier, 20);
        restart("credit-service", 8083);
        publisherAvailable("credit", true);
        awaitOrder(id, "COMPLETED", "SETTLED");
        awaitBalance(requester, 10);
        awaitBalance(courier, 20);
        assertThat(sql("credits")
                        .queryForObject(
                                "SELECT count(*) FROM credit_transaction_log WHERE errand_id=?", Long.class, id))
                .isEqualTo(2);
    }

    @Test
    void registrationsAreDeliveredWhenTheCreditConsumerRestarts() {
        var container =
                environment().getContainerByServiceName("credit-service-1").orElseThrow();
        DockerClientFactory.instance()
                .client()
                .stopContainerCmd(container.getContainerId())
                .withTimeout(10)
                .exec();
        TestUser first;
        TestUser second;
        try {
            first = register("Registered while Credit stopped");
            second = register("Another queued registration");
            assertThat(sql("credits")
                            .queryForObject(
                                    "SELECT count(*) FROM credit_accounts WHERE user_id IN (?, ?)",
                                    Long.class,
                                    first.id(),
                                    second.id()))
                    .isZero();
        } finally {
            restart("credit-service", 8083);
        }
        awaitBalance(first, 15);
        awaitBalance(second, 15);
    }

    private JsonNode say(UUID errand, TestUser sender, String body, int expected) {
        return request(
                "POST",
                "/api/orders/" + errand + "/messages",
                sender.token(),
                Map.of("id", UUID.randomUUID().toString(), "body", body),
                expected);
    }

    private void assertPublishedContracts(String observations, String... expectedTypes) {
        var types = new HashSet<String>();
        await().pollInSameThread().atMost(Duration.ofSeconds(20)).untilAsserted(() -> {
            var messages = sqs.receiveMessage(r -> r.queueUrl(observations)
                            .maxNumberOfMessages(10)
                            .waitTimeSeconds(1)
                            .messageAttributeNames("All"))
                    .messages();
            for (var message : messages) {
                var event = json.readTree(message.body());
                var type = message.messageAttributes().get("eventType").stringValue();
                assertThat(message.messageAttributes().get("eventId").stringValue())
                        .isEqualTo(event.get("eventId").asString());
                assertThat(UUID.fromString(event.get("eventId").asString())).isNotNull();
                assertThat(event.get("schemaVersion").asInt()).isEqualTo(1);
                assertThat(OffsetDateTime.parse(event.get("occurredAt").asString()))
                        .isNotNull();
                assertThat(event.has("eventType")).isFalse();
                var payload = event.get("payload");
                switch (type) {
                    case "UserCreatedEvent" -> {
                        assertThat(payload.size()).isEqualTo(1);
                        assertThat(UUID.fromString(payload.get("userId").asString()))
                                .isNotNull();
                    }
                    case "ErrandCompletedEvent" -> {
                        assertThat(payload.has("courierId")).isTrue();
                        assertThat(payload.get("amount").isIntegralNumber()).isTrue();
                    }
                    case "ErrandCancelledEvent", "ErrandExpiredEvent" -> {
                        assertThat(payload.has("requesterId")).isTrue();
                        assertThat(payload.get("amount").isIntegralNumber()).isTrue();
                    }
                    case "ErrandMessagePostedEvent" -> {
                        assertThat(payload.get("recipientIds").size()).isEqualTo(2);
                        // Text, or a photo/video without text
                        assertThat(
                                        payload.get("body").isNull()
                                                ? payload.get("attachmentType").asString()
                                                : payload.get("body").asString())
                                .isNotBlank();
                    }
                    case "ErrandChatReadEvent" -> {
                        assertThat(payload.get("recipientIds").size()).isEqualTo(2);
                        assertThat(payload.has("lastReadAt")).isTrue();
                    }
                    case "CreditPaidEvent", "CreditRefundedEvent" -> {
                        assertThat(payload.has("operationId")).isTrue();
                        assertThat(payload.has("outcome")).isFalse();
                        assertThat(payload.has("settlementType")).isFalse();
                    }
                    default -> throw new AssertionError("Unexpected integration contract: " + type);
                }
                types.add(type);
                sqs.deleteMessage(r -> r.queueUrl(observations).receiptHandle(message.receiptHandle()));
            }
            assertThat(types).contains(expectedTypes);
        });
    }

    @Test
    void httpRetryAfterOrderFinalizationFailureReusesCommittedReservation() throws Exception {
        var supplier = supplier(admin());
        var requester = register("Retrying requester");
        awaitBalance(requester, 15);
        var key = UUID.randomUUID();
        var body = creation(supplier, key, 1);
        UUID id;
        sql("orders").execute("ALTER TABLE errands ADD CONSTRAINT e2e_reject_open CHECK(status <> 'OPEN') NOT VALID");
        try {
            var failure = request("POST", "/api/orders", requester.token(), body, 500);
            id = sql("orders").queryForObject("SELECT id FROM errands WHERE create_request_id=?", UUID.class, key);
            assertThat(failure.get("code").asString()).isEqualTo("ORDER_CREATION_ERROR");
            assertThat(failure.get("errandId").asString()).isEqualTo(id.toString());
            awaitOrder(id, "CREATING", null);
            assertThat(sql("credits")
                            .queryForObject(
                                    "SELECT state FROM credit_reservations WHERE errand_id=?", String.class, id))
                    .isEqualTo("RESERVED");
        } finally {
            sql("orders").execute("ALTER TABLE errands DROP CONSTRAINT e2e_reject_open");
        }
        var detail = request("GET", "/api/orders/" + id, requester.token(), null, 200);
        assertThat(detail.get("createRequestId").asString()).isEqualTo(key.toString());
        assertThat(detail.has("expiryMinutes")).isFalse();
        String retryPath = "/api/orders/" + id + "/retry-creation";
        var simultaneous = new CyclicBarrier(2);
        Callable<String> retry = () -> {
            // Playwright contexts are thread confined; each caller uses its own client.
            try (var independent = Playwright.create()) {
                var context = independent
                        .request()
                        .newContext(
                                new NewContextOptions().setBaseURL(baseUrl()).setIgnoreHTTPSErrors(true));
                simultaneous.await(15, TimeUnit.SECONDS);
                var response = context.post(
                        retryPath, RequestOptions.create().setHeader("Authorization", "Bearer " + requester.token()));
                assertThat(response.status()).as(response.text()).isEqualTo(200);
                return json.readTree(response.text()).get("errandId").asString();
            }
        };
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(retry);
            var second = executor.submit(retry);
            assertThat(first.get(30, TimeUnit.SECONDS)).isEqualTo(id.toString());
            assertThat(second.get(30, TimeUnit.SECONDS)).isEqualTo(id.toString());
        }
        assertThat(sql("orders")
                        .queryForObject("SELECT count(*) FROM errands WHERE create_request_id=?", Long.class, key))
                .isEqualTo(1);
        assertThat(request("POST", "/api/orders", requester.token(), body, 200)
                        .get("errandId")
                        .asString())
                .isEqualTo(id.toString());
        assertThat(request("POST", "/api/orders", requester.token(), body, 200)
                        .get("errandId")
                        .asString())
                .isEqualTo(id.toString());
        awaitOrder(id, "OPEN", "RESERVED");
        assertThat(sql("credits")
                        .queryForObject("SELECT count(*) FROM credit_reservations WHERE errand_id=?", Long.class, id))
                .isEqualTo(1);
        assertThat(sql("credits")
                        .queryForObject(
                                "SELECT count(*) FROM credit_transaction_log WHERE errand_id=?", Long.class, id))
                .isEqualTo(1);
        request("POST", "/api/orders/" + id + "/cancel", requester.token(), null, 200);
        awaitOrder(id, "CANCELLED", "RELEASED");
    }

    @Test
    void insufficientBalanceRejectsOrderCreation() {
        var supplier = supplier(admin());
        var requester = register("Requester with insufficient credits");
        awaitBalance(requester, 15);
        var rejected = UUID.fromString(
                request("POST", "/api/orders", requester.token(), creation(supplier, UUID.randomUUID(), 16), 200)
                        .get("errandId")
                        .asString());
        awaitOrder(rejected, "CREATE_FAILED", null);
        assertThat(sql("orders")
                        .queryForObject("SELECT creation_failure_code FROM errands WHERE id=?", String.class, rejected))
                .isEqualTo("INSUFFICIENT_BALANCE");
    }

    private Map<String, Object> creation(UUID supplier, UUID key, int amount) {
        return Map.of(
                "createRequestId",
                key,
                "supplierId",
                supplier,
                "deliveryLocation",
                "COM1",
                "description",
                "Lunch",
                "creditReward",
                amount,
                "expiryMinutes",
                10);
    }

    private void publisherAvailable(String service, boolean available) {
        var response = api.post(
                "http://" + host("toxiproxy", 8474) + ":" + port("toxiproxy", 8474) + "/proxies/" + service + "-sns",
                RequestOptions.create().setData(Map.of("enabled", available)));
        assertThat(response.ok()).as(response.text()).isTrue();
    }

    private void restart(String service, int internalPort) {
        var container = environment().getContainerByServiceName(service + "-1").orElseThrow();
        DockerClientFactory.instance()
                .client()
                .restartContainerCmd(container.getContainerId())
                .withTimeout(10)
                .exec();
        await().pollInSameThread()
                .atMost(Duration.ofSeconds(60))
                .ignoreExceptions()
                .until(() -> api.get("http://" + host(service, internalPort) + ":" + port(service, internalPort)
                                + "/api/actuator/health")
                        .ok());
    }

    private void awaitBalance(TestUser user, long expected) {
        await().pollInSameThread().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(
                        request("GET", "/api/credits/me", user.token(), null, 200)
                                .get("availableBalance")
                                .asLong())
                .isEqualTo(expected));
    }

    private UUID create(TestUser user, UUID supplier, int amount) {
        var id = UUID.fromString(
                request("POST", "/api/orders", user.token(), creation(supplier, UUID.randomUUID(), amount), 200)
                        .get("errandId")
                        .asString());
        awaitOrder(id, "OPEN", "RESERVED");
        return id;
    }

    private UUID completeOrder(TestUser requester, TestUser courier, UUID supplier, int amount) {
        var id = create(requester, supplier, amount);
        request("POST", "/api/orders/" + id + "/accept", courier.token(), null, 200);
        request("POST", "/api/orders/" + id + "/pick-up", courier.token(), null, 200);
        deliver(id, courier.token(), 200);
        request("POST", "/api/orders/" + id + "/complete", requester.token(), null, 200);
        awaitOrder(id, "COMPLETED", "SETTLED");
        return id;
    }

    private void awaitOrder(UUID id, String status, String state) {
        await().pollInSameThread().atMost(Duration.ofSeconds(30)).untilAsserted(() -> {
            var row = sql("orders").queryForMap("SELECT status, credit_state FROM errands WHERE id=?", id);
            assertThat(row.get("status")).isEqualTo(status);
            assertThat(row.get("credit_state")).isEqualTo(state);
        });
    }

    private void awaitFailedPublication(String service, String listener, UUID errand) {
        await().pollInSameThread().atMost(Duration.ofSeconds(20)).untilAsserted(() -> assertThat(sql(service)
                        .queryForObject(
                                "SELECT count(*) FROM event_publication WHERE listener_id=? AND serialized_event::jsonb->'payload'->>'errandId'=? AND status='FAILED'",
                                Long.class,
                                listener,
                                errand.toString()))
                .isEqualTo(1));
    }

    private String topic(String service) {
        return "arn:aws:sns:ap-southeast-1:000000000000:foc-e2e-" + service + "-events";
    }

    private MessageAttributeValue attribute(String value) {
        return MessageAttributeValue.builder()
                .dataType("String")
                .stringValue(value)
                .build();
    }
}
