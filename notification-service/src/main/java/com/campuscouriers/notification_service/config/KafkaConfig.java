/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-11-09 to 2026-11-10
 * Scope (AI-26): Generated Terraform, Kubernetes manifests and scripts for the AWS resources I specified.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-08
 * Scope: Implementation and test assistance for chat notification events.
 */
package com.campuscouriers.notification_service.config;

import com.campuscouriers.notification_service.event.InvalidNotificationEventException;
import org.apache.kafka.common.TopicPartition;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;
import org.springframework.kafka.core.KafkaAdmin;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.util.backoff.FixedBackOff;

@Configuration
public class KafkaConfig {
    @Bean
    KafkaAdmin.NewTopics notificationTopics() {
        // Match the existing outbox topics' three partitions, including their DLTs.
        // No .replicas(): use the broker's default replication factor (1 locally, 3 on EKS). A fixed
        // 1 breaks on EKS, where min.insync.replicas=2 makes writes to a 1-copy topic fail.
        return new KafkaAdmin.NewTopics(
            TopicBuilder.name("errand.accepted").partitions(3).build(),
            TopicBuilder.name("errand.delivered").partitions(3).build(),
            TopicBuilder.name("errand.completed").partitions(3).build(),
            TopicBuilder.name("errand.failed").partitions(3).build(),
            TopicBuilder.name("errand.expired").partitions(3).build(),
            TopicBuilder.name("credit.received").partitions(3).build(),
            TopicBuilder.name("credit.released").partitions(3).build(),
            TopicBuilder.name("chat.message.created").partitions(3).build(),
            TopicBuilder.name("errand.accepted.notification-dlt").partitions(3).build(),
            TopicBuilder.name("errand.delivered.notification-dlt").partitions(3).build(),
            TopicBuilder.name("errand.completed.notification-dlt").partitions(3).build(),
            TopicBuilder.name("errand.failed.notification-dlt").partitions(3).build(),
            TopicBuilder.name("errand.expired.notification-dlt").partitions(3).build(),
            TopicBuilder.name("credit.received.notification-dlt").partitions(3).build(),
            TopicBuilder.name("credit.released.notification-dlt").partitions(3).build(),
            TopicBuilder.name("chat.message.created.notification-dlt").partitions(3).build());
    }

    @Bean
    DefaultErrorHandler notificationErrorHandler(KafkaTemplate<String, String> template) {
        var recoverer = new DeadLetterPublishingRecoverer(template,
            (record, exception) -> new TopicPartition(
                record.topic() + ".notification-dlt", record.partition()));
        // Do not advance past a failed event unless Kafka confirms its DLT publication.
        recoverer.setFailIfSendResultIsError(true);
        var handler = new DefaultErrorHandler(recoverer, new FixedBackOff(1000L, 2L));
        handler.addNotRetryableExceptions(InvalidNotificationEventException.class);
        return handler;
    }
}
