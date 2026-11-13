package com.friendoncampus.credit.integration;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.credit.domain.CreditInboxEvent;
import com.friendoncampus.credit.repository.CreditInboxEventRepository;

@Service
public class CreditInboxFailureService {

    private final CreditInboxEventRepository inbox;

    public CreditInboxFailureService(CreditInboxEventRepository inbox) {
        this.inbox = inbox;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordFailure(UUID eventId, Throwable failure) {
        CreditInboxEvent event = inbox.findByEventIdForUpdate(eventId)
                .orElseThrow(() -> new IllegalStateException("Inbox event is missing"));
        event.markFailed(failure.getMessage());
        inbox.save(event);
    }
}
