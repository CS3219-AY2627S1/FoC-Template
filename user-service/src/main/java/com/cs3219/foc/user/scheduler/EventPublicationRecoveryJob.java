package com.cs3219.foc.user.scheduler;

import com.cs3219.foc.user.config.EventPublicationProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.modulith.events.FailedEventPublications;
import org.springframework.modulith.events.ResubmissionOptions;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Retries publications through the shared registry, without event-specific delivery tables. */
@Component
@RequiredArgsConstructor
public class EventPublicationRecoveryJob {
    private final FailedEventPublications publications;
    private final EventPublicationProperties properties;

    @Scheduled(fixedDelayString = "${events.publication.retry-delay:30s}")
    public void retryFailed() {
        publications.resubmit(ResubmissionOptions.defaults().withBatchSize(50).withMinAge(properties.retryDelay()));
    }
}
