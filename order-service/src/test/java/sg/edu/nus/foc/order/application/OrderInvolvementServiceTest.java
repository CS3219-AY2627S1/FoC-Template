package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;

import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;

class OrderInvolvementServiceTest {

    private final OrderRepository orders = mock(OrderRepository.class);
    private final OrderInvolvementService service = new OrderInvolvementService(orders);

    @Test
    void returnsDatabaseExistenceForEachKindWithoutLoadingOrders() {
        when(orders.hasActiveUserInvolvement("user")).thenReturn(true);
        when(orders.hasActiveSupplierInvolvement("supplier")).thenReturn(false);
        assertTrue(service.user("user").isHasActiveOrders());
        assertEquals("user", service.user("user").getSubjectId());
        assertFalse(service.supplier("supplier").isHasActiveOrders());
        verify(orders).hasActiveSupplierInvolvement("supplier");
    }

    @Test
    void invalidIdsFailBeforeDatabaseRead() {
        for (String id : new String[] {null, " ", "x".repeat(129)}) {
            assertEquals("VALIDATION_ERROR", assertThrows(OrderProblem.class, () -> service.user(id)).getCode());
            assertThrows(OrderProblem.class, () -> service.supplier(id));
            assertThrows(OrderProblem.class, () -> service.canDeleteUser(id));
        }
        verifyNoInteractions(orders);
    }
}
