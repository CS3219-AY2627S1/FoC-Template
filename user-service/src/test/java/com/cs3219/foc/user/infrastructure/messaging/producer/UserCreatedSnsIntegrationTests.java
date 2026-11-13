package com.cs3219.foc.user.infrastructure.messaging.producer;

import static org.assertj.core.api.Assertions.*;

import com.cs3219.foc.user.integration.AbstractIntegrationTest;
import com.cs3219.foc.user.model.dto.event.UserCreatedEvent;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import software.amazon.awssdk.services.sns.SnsClient;
import software.amazon.awssdk.services.sns.model.SubscribeRequest;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.CreateQueueRequest;
import software.amazon.awssdk.services.sqs.model.GetQueueAttributesRequest;
import software.amazon.awssdk.services.sqs.model.QueueAttributeName;
import software.amazon.awssdk.services.sqs.model.ReceiveMessageRequest;
import software.amazon.awssdk.services.sqs.model.SetQueueAttributesRequest;
import tools.jackson.databind.json.JsonMapper;

/** Publishes through the production SNS client to Floci, without starting a consumer. */
@SpringBootTest
@Import(AbstractIntegrationTest.Aws.class)
class UserCreatedSnsIntegrationTests extends AbstractIntegrationTest {
    @Autowired
    SnsClient sns;

    @Autowired
    SqsClient sqs;

    @Autowired
    SnsUserCreatedEventPublisher publisher;

    @Test
    void publishesTheEventContractToTheSubscribedQueue() throws Exception {
        var suffix = UUID.randomUUID().toString().replace("-", "");
        var topicArn = "arn:aws:sns:ap-southeast-1:000000000000:foc-test-user-events";
        var queueName = "foc-user-it-" + suffix;
        var queueUrl = sqs.createQueue(
                        CreateQueueRequest.builder().queueName(queueName).build())
                .queueUrl();
        var queueArn = sqs.getQueueAttributes(GetQueueAttributesRequest.builder()
                        .queueUrl(queueUrl)
                        .attributeNames(QueueAttributeName.QUEUE_ARN)
                        .build())
                .attributes()
                .get(QueueAttributeName.QUEUE_ARN);
        sqs.setQueueAttributes(SetQueueAttributesRequest.builder()
                .queueUrl(queueUrl)
                .attributes(Map.of(
                        QueueAttributeName.POLICY,
                        "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"sns.amazonaws.com\"},\"Action\":\"sqs:SendMessage\",\"Resource\":\""
                                + queueArn + "\",\"Condition\":{\"ArnEquals\":{\"aws:SourceArn\":\"" + topicArn
                                + "\"}}}]}"))
                .build());
        sns.subscribe(SubscribeRequest.builder()
                .topicArn(topicArn)
                .protocol("sqs")
                .endpoint(queueArn)
                .attributes(Map.of(
                        "RawMessageDelivery", "true",
                        "FilterPolicyScope", "MessageAttributes",
                        "FilterPolicy", "{\"eventType\":[\"UserCreatedEvent\"]}"))
                .build());
        var eventId = UUID.randomUUID();
        var userId = UUID.randomUUID();
        var occurredAt = OffsetDateTime.now();
        var event = new UserCreatedEvent(eventId, 1, occurredAt, new UserCreatedEvent.Payload(userId));
        publisher.publish(event);
        var received = sqs.receiveMessage(ReceiveMessageRequest.builder()
                        .queueUrl(queueUrl)
                        .maxNumberOfMessages(1)
                        .waitTimeSeconds(10)
                        .messageAttributeNames("All")
                        .build())
                .messages()
                .getFirst();
        assertThat(received.messageAttributes().get("eventType").stringValue()).isEqualTo(UserCreatedEvent.TYPE);
        assertThat(received.messageAttributes().get("eventId").stringValue())
                .isEqualTo(event.eventId().toString());
        var body = JsonMapper.builder().build().readTree(received.body());
        assertThat(body.get("eventId").asString()).isEqualTo(eventId.toString());
        assertThat(body.get("schemaVersion").asInt()).isEqualTo(1);
        assertThat(body.get("payload").get("userId").asString()).isEqualTo(userId.toString());
        assertThat(body.get("payload").size()).isEqualTo(1);

        publisher.publish(event);
        var again = sqs.receiveMessage(ReceiveMessageRequest.builder()
                        .queueUrl(queueUrl)
                        .maxNumberOfMessages(1)
                        .waitTimeSeconds(10)
                        .build())
                .messages()
                .getFirst();
        var againBody = JsonMapper.builder().build().readTree(again.body());
        assertThat(againBody.get("eventId").asString())
                .isEqualTo(event.eventId().toString());
    }
}
