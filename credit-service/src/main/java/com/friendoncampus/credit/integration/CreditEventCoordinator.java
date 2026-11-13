package com.friendoncampus.credit.integration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.friendoncampus.credit.domain.InboxEventStatus;

@Service
public class CreditEventCoordinator {

    private static final Logger LOGGER = LoggerFactory.getLogger(CreditEventCoordinator.class);

    private final CreditInboxReceiptService receipts;
    private final CreditInboxProcessingService processing;
    private final CreditInboxFailureService failures;

    public CreditEventCoordinator(
            CreditInboxReceiptService receipts,
            CreditInboxProcessingService processing,
            CreditInboxFailureService failures) {
        this.receipts = receipts;
        this.processing = processing;
        this.failures = failures;
    }

    public ProcessingOutcome process(CreditEventEnvelope envelope, Runnable handler) {
        CreditInboxReceiptService.Receipt receipt = receipts.register(envelope);
        if (receipt.status() == InboxEventStatus.PROCESSED) {
            LOGGER.info("Ignored processed duplicate credit event eventId={} eventType={} producer={}",
                    envelope.eventId(), envelope.eventType(), envelope.producer());
            return ProcessingOutcome.DUPLICATE;
        }

        try {
            CreditInboxProcessingService.ProcessingResult result = processing.process(envelope, handler);
            ProcessingOutcome outcome = ProcessingOutcome.valueOf(result.name());
            LOGGER.info("Credit event outcome={} eventId={} eventType={} producer={} correlationId={}",
                    outcome, envelope.eventId(), envelope.eventType(), envelope.producer(), envelope.correlationId());
            return outcome;
        } catch (RuntimeException failure) {
            try {
                failures.recordFailure(envelope.eventId(), failure);
            } catch (RuntimeException trackingFailure) {
                failure.addSuppressed(trackingFailure);
            }
            LOGGER.warn("Credit event failed eventId={} eventType={} producer={} correlationId={}",
                    envelope.eventId(), envelope.eventType(), envelope.producer(), envelope.correlationId(), failure);
            throw failure;
        }
    }

    public enum ProcessingOutcome {
        PROCESSED,
        DUPLICATE,
        STALE
    }
}
