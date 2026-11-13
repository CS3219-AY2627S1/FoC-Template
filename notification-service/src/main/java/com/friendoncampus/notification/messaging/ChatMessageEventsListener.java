package com.friendoncampus.notification.messaging;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;

/** Notification's independent consumer for user-authored Chat messages. */
public class ChatMessageEventsListener {
    private final ChatMessageEventHandler handler;

    public ChatMessageEventsListener(ChatMessageEventHandler handler) {
        this.handler = handler;
    }

    @KafkaListener(id = "notification-chat-events", topics = ChatMessageEventHandler.TOPIC,
            groupId = "notification-service", containerFactory = "chatEventsContainerFactory")
    public void receive(ConsumerRecord<String, String> record, Acknowledgment acknowledgment) {
        handler.handle(record.key(), record.value());
        acknowledgment.acknowledge();
    }
}
