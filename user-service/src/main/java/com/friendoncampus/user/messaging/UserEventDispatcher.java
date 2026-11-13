package com.friendoncampus.user.messaging;

import org.springframework.scheduling.annotation.Scheduled;

public class UserEventDispatcher {
    private final UserOutboxPublisher publisher;
    private final UserEventSettings settings;

    public UserEventDispatcher(UserOutboxPublisher publisher, UserEventSettings settings) {
        this.publisher = publisher;
        this.settings = settings;
    }

    @Scheduled(fixedDelayString = "${app.events.poll-interval-ms:5000}",
            initialDelayString = "${app.events.initial-delay-ms:5000}")
    public void publishPending() {
        for (int i = 0; i < settings.batchSize() && !Thread.currentThread().isInterrupted(); i++) {
            if (!publisher.publishNext()) break;
        }
    }
}
