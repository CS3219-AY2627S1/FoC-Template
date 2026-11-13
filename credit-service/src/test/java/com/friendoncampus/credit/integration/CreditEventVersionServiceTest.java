package com.friendoncampus.credit.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.friendoncampus.credit.domain.CreditEventStreamVersion;
import com.friendoncampus.credit.repository.CreditEventStreamVersionRepository;

@ExtendWith(MockitoExtension.class)
class CreditEventVersionServiceTest {
    @Mock CreditEventStreamVersionRepository versions;
    @Mock CreditEventStreamVersion stream;

    @Test
    void acceptsTheNextVersionAndAdvancesOnlyAfterProcessing() {
        CreditEventEnvelope event = orderEvent(3);
        when(stream.getLatestVersion()).thenReturn(2L);
        when(versions.findForUpdate("Order", event.aggregateId())).thenReturn(Optional.of(stream));
        CreditEventVersionService service = new CreditEventVersionService(versions);

        assertThat(service.evaluate(event)).isEqualTo(CreditEventVersionService.Decision.PROCESS);
        service.advance(event);

        verify(stream).advance(3, event.eventId(), event.eventType());
        verify(versions).save(stream);
    }

    @Test
    void skipsOlderEventsRejectsSameVersionConflictsAndAllowsExpectedVersionGaps() {
        CreditEventVersionService service = new CreditEventVersionService(versions);
        CreditEventEnvelope stale = orderEvent(1);
        CreditEventEnvelope conflict = orderEvent(2);
        CreditEventEnvelope gap = orderEvent(4);
        when(versions.findForUpdate("Order", stale.aggregateId())).thenReturn(Optional.of(stream));
        when(versions.findForUpdate("Order", conflict.aggregateId())).thenReturn(Optional.of(stream));
        when(versions.findForUpdate("Order", gap.aggregateId())).thenReturn(Optional.of(stream));
        when(stream.getLatestVersion()).thenReturn(2L);
        when(stream.getLatestEventType()).thenReturn("OrderSubmitted");
        when(stream.getLatestEventId()).thenReturn(UUID.randomUUID());

        assertThat(service.evaluate(stale)).isEqualTo(CreditEventVersionService.Decision.STALE);
        assertThatThrownBy(() -> service.evaluate(conflict)).isInstanceOf(EventVersionConflictException.class);
        assertThat(service.evaluate(gap)).isEqualTo(CreditEventVersionService.Decision.PROCESS);
    }

    private static CreditEventEnvelope orderEvent(long version) {
        return new CreditEventEnvelope(
                UUID.randomUUID(), "OrderSubmitted", 1, "Order", UUID.randomUUID(), version,
                OffsetDateTime.parse("2026-10-18T10:15:30Z"), "order-service", UUID.randomUUID(), null,
                "{\"type\":\"SYSTEM\"}", "{\"operationId\":\"" + UUID.randomUUID() + "\"}");
    }
}
