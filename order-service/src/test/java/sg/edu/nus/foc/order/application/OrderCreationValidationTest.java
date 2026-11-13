package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.repository.*;

class OrderCreationValidationTest {
    @Test
    void badSupplierPairStopsBeforeSupplierAndCreditCalls() {
        UserServicePort users = mock(UserServicePort.class);
        SupplierServicePort suppliers = mock(SupplierServicePort.class);
        CreditServicePort credits = mock(CreditServicePort.class);
        OrderRepository orders = mock(OrderRepository.class);
        when(users.verifyRequester("owner", "Bearer owner")).thenReturn("owner");
        OrderCreationService service = new OrderCreationService(orders, mock(CommandReceiptRepository.class),
                mock(OrderCheckpointRepository.class), users, suppliers, credits, mock(OrderAuditLogger.class));
        OrderProblem error = assertThrows(OrderProblem.class, () -> service.create("bad", "owner", "item", "same", "same",
                1, 15, Instant.now().plusSeconds(3600), null, "Bearer owner"));
        assertEquals("deliverySupplierId", error.getDetails().getFirst().getField());
        verifyNoInteractions(suppliers, credits, orders);
    }
}
