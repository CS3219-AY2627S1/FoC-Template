package com.friendoncampus.credit.integration;

import org.springframework.stereotype.Service;

import com.friendoncampus.credit.domain.CreditEventStreamVersion;
import com.friendoncampus.credit.repository.CreditEventStreamVersionRepository;

@Service
public class CreditEventVersionService {
    private final CreditEventStreamVersionRepository versions;

    public CreditEventVersionService(CreditEventStreamVersionRepository versions) {
        this.versions = versions;
    }

    public Decision evaluate(CreditEventEnvelope envelope) {
        if (!"Order".equals(envelope.aggregateType())) {
            return Decision.PROCESS;
        }
        versions.insertIfAbsent(envelope.aggregateType(), envelope.aggregateId());
        CreditEventStreamVersion stream = versions.findForUpdate(envelope.aggregateType(), envelope.aggregateId())
                .orElseThrow(() -> new IllegalStateException("Credit event stream version is missing"));

        if (envelope.aggregateVersion() < stream.getLatestVersion()) {
            return Decision.STALE;
        }
        if (envelope.aggregateVersion() == stream.getLatestVersion()) {
            throw new EventVersionConflictException(envelope, stream);
        }
        return Decision.PROCESS;
    }

    public void advance(CreditEventEnvelope envelope) {
        if (!"Order".equals(envelope.aggregateType())) {
            return;
        }
        CreditEventStreamVersion stream = versions.findForUpdate(envelope.aggregateType(), envelope.aggregateId())
                .orElseThrow(() -> new IllegalStateException("Credit event stream version is missing"));
        stream.advance(envelope.aggregateVersion(), envelope.eventId(), envelope.eventType());
        versions.save(stream);
    }

    public enum Decision {
        PROCESS,
        STALE
    }
}
