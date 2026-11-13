package sg.edu.nus.foc.order.infrastructure;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderCourierAttempt;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.Query;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.domain.repository.UserDeletionGuard;

class OrderPersistenceAdapterTest {
    @Test
    void requesterVisibilityIsFilteredInBothContentAndCountQueries() throws NoSuchMethodException {
        Query query = JpaOrderRepository.class
                .getMethod("findByRequesterIdOrderByCreatedAtDesc", String.class, Pageable.class)
                .getAnnotation(Query.class);

        assertNotNull(query, "Superseded expired orders must be filtered before database pagination");
        for (String statement : List.of(query.value(), query.countQuery())) {
            assertTrue(statement.contains("o.requesterId = :requesterId"));
            assertTrue(statement.contains("o.repostedOrderId is null"));
            assertTrue(statement.contains("o.status <> sg.edu.nus.foc.order.domain.OrderStatus.EXPIRED"));
        }
    }

    @Test
    void autoCompletionSelectionUsesDatabaseEligibleDeliveredCheckpointCutoff() {
        JpaOrderRepository jpa = mock(JpaOrderRepository.class);
        Instant cutoff = Instant.parse("2026-10-05T10:00:00Z");
        when(jpa.findDueForAutoCompletion(OrderStatus.DELIVERED, cutoff)).thenReturn(List.of());
        OrderPersistenceAdapter adapter = new OrderPersistenceAdapter(jpa, mock(JpaOrderCourierAttemptRepository.class), mock(UserDeletionGuard.class));

        adapter.findDueForAutoCompletion(cutoff);

        verify(jpa).findDueForAutoCompletion(OrderStatus.DELIVERED, cutoff);
    }

    @Test
    void lifecycleIdSelectionAndRowLockDelegateToInfrastructure() {
        JpaOrderRepository jpa = mock(JpaOrderRepository.class);
        OrderPersistenceAdapter adapter = new OrderPersistenceAdapter(jpa, mock(JpaOrderCourierAttemptRepository.class), mock(UserDeletionGuard.class));
        Instant cutoff = Instant.parse("2026-10-05T10:00:00Z");
        when(jpa.findDueUnassignedIds(OrderStatus.OPEN, cutoff)).thenReturn(List.of("expired"));
        when(jpa.findDueForAutoCompletionIds(OrderStatus.DELIVERED, cutoff)).thenReturn(List.of("delivered"));

        assertEquals(List.of("expired"), adapter.findDueUnassignedIds(OrderStatus.OPEN, cutoff));
        assertEquals(List.of("delivered"), adapter.findDueForAutoCompletionIds(cutoff));
        adapter.getForLifecycleUpdate("expired");

        verify(jpa).findByIdForLifecycleUpdate("expired");
    }

    @Test
    void absentStatusUsesPagedUnfilteredQuerySortedNewestFirst() {
        JpaOrderRepository jpa = mock(JpaOrderRepository.class);
        when(jpa.findAll(any(Pageable.class))).thenReturn(new PageImpl<>(List.of()));
        OrderPersistenceAdapter adapter = new OrderPersistenceAdapter(jpa, mock(JpaOrderCourierAttemptRepository.class), mock(UserDeletionGuard.class));

        adapter.findAllOrders(null, 2, 25);

        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);
        verify(jpa).findAll(pageable.capture());
        assertEquals(PageRequest.of(2, 25, Sort.by(Sort.Direction.DESC, "createdAt")), pageable.getValue());
    }

    @Test
    void suppliedStatusUsesExactStatusFilterAndClampsThePageSize() {
        JpaOrderRepository jpa = mock(JpaOrderRepository.class);
        when(jpa.findByStatusOrderByCreatedAtDesc(eq(OrderStatus.COMPLETED), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));
        OrderPersistenceAdapter adapter = new OrderPersistenceAdapter(jpa, mock(JpaOrderCourierAttemptRepository.class), mock(UserDeletionGuard.class));

        adapter.findAllOrders(OrderStatus.COMPLETED, 0, 200);

        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);
        verify(jpa).findByStatusOrderByCreatedAtDesc(eq(OrderStatus.COMPLETED), pageable.capture());
        assertEquals(100, pageable.getValue().getPageSize());
        assertEquals(Sort.by(Sort.Direction.DESC, "createdAt"), pageable.getValue().getSort());
    }

    @Test
    void personalStatusFiltersUseDatabasePaginationAndPreserveFilteredTotals() {
        JpaOrderRepository jpa = mock(JpaOrderRepository.class);
        OrderPersistenceAdapter adapter = new OrderPersistenceAdapter(jpa, mock(JpaOrderCourierAttemptRepository.class), mock(UserDeletionGuard.class));
        PageRequest page = PageRequest.of(1, 10);
        when(jpa.findRequesterOrdersByStatus("requester", OrderStatus.EXPIRED, page))
                .thenReturn(new PageImpl<>(List.of(), page, 12));
        when(jpa.findByRequesterIdOrderByCreatedAtDesc("requester", page))
                .thenReturn(new PageImpl<>(List.of(), page, 25));
        when(jpa.findCourierTimelineByStatus("courier", "COMPLETED", page))
                .thenReturn(new PageImpl<>(List.of(), page, 15));
        when(jpa.findCourierTimeline("courier", page))
                .thenReturn(new PageImpl<>(List.of(), page, 31));

        assertEquals(12, adapter.findRequestedBy("requester", OrderStatus.EXPIRED, 1, 10).getTotalItems());
        assertEquals(25, adapter.findRequestedBy("requester", null, 1, 10).getTotalItems());
        assertEquals(15, adapter.findCourierOrders("courier", OrderStatus.COMPLETED, 1, 10).getTotalItems());
        assertEquals(31, adapter.findCourierOrders("courier", null, 1, 10).getTotalItems());
        verify(jpa).findRequesterOrdersByStatus("requester", OrderStatus.EXPIRED, page);
        verify(jpa).findCourierTimelineByStatus("courier", "COMPLETED", page);
    }

    @Test
    void abortedStatusReturnsImmutableAttemptViewsWithoutReadingCurrentReopenedState() {
        JpaOrderRepository jpa = mock(JpaOrderRepository.class);
        JpaOrderCourierAttemptRepository attempts = mock(JpaOrderCourierAttemptRepository.class);
        OrderPersistenceAdapter adapter = new OrderPersistenceAdapter(jpa, attempts, mock(UserDeletionGuard.class));
        Instant now = Instant.parse("2026-10-09T10:00:00Z");
        Order order = Order.open("requester", "item", "pickup", "delivery", 3, 30, now, now.plusSeconds(3600));
        order.accept("courier", 0, now.plusSeconds(1));
        OrderCourierAttempt attempt = new OrderCourierAttempt(order, "courier", order.getVersion(), now.plusSeconds(2));
        CourierOrderReference reference = mock(CourierOrderReference.class);
        when(reference.getAttemptId()).thenReturn(attempt.getId());
        when(attempts.findById(attempt.getId())).thenReturn(Optional.of(attempt));
        when(jpa.findCourierTimelineByStatus(eq("courier"), eq("ABORTED"), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(reference)));

        Order result = adapter.findCourierOrders("courier", OrderStatus.ABORTED, 0, 20).getItems().getFirst();
        assertEquals(OrderStatus.ABORTED, result.getStatus());
        assertEquals(attempt.getId(), result.getAttemptId());
        assertEquals("courier", result.getCourierId());
    }
}
