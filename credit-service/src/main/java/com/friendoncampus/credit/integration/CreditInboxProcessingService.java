package com.friendoncampus.credit.integration;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.credit.domain.CreditInboxEvent;
import com.friendoncampus.credit.domain.InboxEventStatus;
import com.friendoncampus.credit.repository.CreditInboxEventRepository;

@Service
public class CreditInboxProcessingService {

    private final CreditInboxEventRepository inbox;
    private final CreditEventVersionService versions;

    public CreditInboxProcessingService(CreditInboxEventRepository inbox, CreditEventVersionService versions) {
        this.inbox = inbox;
        this.versions = versions;
    }

    @Transactional
    public ProcessingResult process(CreditEventEnvelope envelope, Runnable handler) {
        UUID eventId = envelope.eventId();
        CreditInboxEvent event = inbox.findByEventIdForUpdate(eventId)
                .orElseThrow(() -> new IllegalStateException("Inbox event is missing"));
        if (event.getStatus() == InboxEventStatus.PROCESSED) {
            return ProcessingResult.DUPLICATE;
        }
        if (versions.evaluate(envelope) == CreditEventVersionService.Decision.STALE) {
            event.markProcessed();
            inbox.save(event);
            return ProcessingResult.STALE;
        }
        handler.run();
        versions.advance(envelope);
        event.markProcessed();
        inbox.save(event);
        return ProcessingResult.PROCESSED;
    }

    public enum ProcessingResult {
        PROCESSED,
        DUPLICATE,
        STALE
    }
}
