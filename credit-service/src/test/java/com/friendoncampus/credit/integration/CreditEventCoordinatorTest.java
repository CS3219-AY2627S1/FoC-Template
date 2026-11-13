package com.friendoncampus.credit.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.friendoncampus.credit.domain.InboxEventStatus;

@ExtendWith(MockitoExtension.class)
class CreditEventCoordinatorTest {

    @Mock CreditInboxReceiptService receipts;
    @Mock CreditInboxProcessingService processing;
    @Mock CreditInboxFailureService failures;
    @Mock Runnable handler;

    @Test
    void processesANewlyReceivedEvent() {
        CreditEventEnvelope event = event();
        when(receipts.register(event)).thenReturn(
                new CreditInboxReceiptService.Receipt(InboxEventStatus.RECEIVED, false));
        when(processing.process(event, handler)).thenReturn(CreditInboxProcessingService.ProcessingResult.PROCESSED);
        CreditEventCoordinator coordinator = new CreditEventCoordinator(receipts, processing, failures);

        assertThat(coordinator.process(event, handler))
                .isEqualTo(CreditEventCoordinator.ProcessingOutcome.PROCESSED);

        verify(processing).process(event, handler);
        verify(failures, never()).recordFailure(event.eventId(), null);
    }

    @Test
    void ignoresAnAlreadyProcessedDuplicate() {
        CreditEventEnvelope event = event();
        when(receipts.register(event)).thenReturn(
                new CreditInboxReceiptService.Receipt(InboxEventStatus.PROCESSED, true));
        CreditEventCoordinator coordinator = new CreditEventCoordinator(receipts, processing, failures);

        assertThat(coordinator.process(event, handler))
                .isEqualTo(CreditEventCoordinator.ProcessingOutcome.DUPLICATE);

        verify(processing, never()).process(event, handler);
    }

    @Test
    void recordsTheFailureAndAllowsTheBrokerToRetry() {
        CreditEventEnvelope event = event();
        IllegalStateException failure = new IllegalStateException("temporary database problem");
        when(receipts.register(event)).thenReturn(
                new CreditInboxReceiptService.Receipt(InboxEventStatus.RECEIVED, false));
        doThrow(failure).when(processing).process(event, handler);
        CreditEventCoordinator coordinator = new CreditEventCoordinator(receipts, processing, failures);

        assertThatThrownBy(() -> coordinator.process(event, handler)).isSameAs(failure);

        verify(failures).recordFailure(event.eventId(), failure);
    }

    private static CreditEventEnvelope event() {
        UUID eventId = UUID.randomUUID();
        return new CreditEventEnvelope(
                eventId,
                "OrderSubmitted",
                1,
                "Order",
                UUID.randomUUID(),
                0,
                OffsetDateTime.parse("2026-10-15T14:00:00Z"),
                "order-service",
                UUID.randomUUID(),
                null,
                "{\"type\":\"SYSTEM\"}",
                "{\"amount\":3}");
    }
}
