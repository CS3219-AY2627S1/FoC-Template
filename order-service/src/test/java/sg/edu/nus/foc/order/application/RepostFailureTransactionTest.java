package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.http.HttpStatusCode;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.ResourceAccessException;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.repository.CommandReceiptRepository;
import sg.edu.nus.foc.order.domain.repository.OrderCheckpointRepository;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;

class RepostFailureTransactionTest {
    private final OrderRepository orders = mock(OrderRepository.class);
    private final SupplierServicePort suppliers = mock(SupplierServicePort.class);
    private final CreditServicePort credits = mock(CreditServicePort.class);
    private final UserServicePort users = mock(UserServicePort.class);
    private final RepostFailureRecorder failures = mock(RepostFailureRecorder.class);
    private final OrderRepostService service = new OrderRepostService(orders, mock(OrderCheckpointRepository.class),
            mock(CommandReceiptRepository.class), suppliers, credits, users, mock(OrderAuditLogger.class), failures);

    private Order original() {
        Instant now = Instant.now();
        Order order = Order.open("owner", "item", "pickup", "delivery", 1, 15,
                now.minusSeconds(7200), now.minusSeconds(3600));
        order.expire(0, now);
        when(orders.getForUpdate(order.getId())).thenReturn(Optional.of(order));
        when(users.verifyRequester("owner", "token")).thenReturn("owner");
        return order;
    }

    private OrderProblem attempt(Order order) {
        return assertThrows(OrderProblem.class, () -> service.manual("failure", order.getId(), "owner", 0,
                "item", 1, 15, Instant.now().plusSeconds(3600), "token"));
    }

    @ParameterizedTest
    @CsvSource({"400,VALIDATION_ERROR", "422,VALIDATION_ERROR", "401,UNAUTHENTICATED", "403,FORBIDDEN",
            "404,NOT_FOUND", "409,CONFLICT", "503,SERVICE_UNAVAILABLE"})
    void translatesSupplierErrorsWithoutSavingRawPeerDetails(int status, String code) {
        Order order = original();
        doThrow(new HttpClientErrorException(HttpStatusCode.valueOf(status), "private diagnostic"))
                .when(suppliers).validatePair("pickup", "delivery", "token");
        assertEquals(code, attempt(order).getCode());
        verify(failures).record(eq(order.getId()), eq(code), any());
        verifyNoInteractions(credits);
    }

    @Test
    void waitsForRollbackBeforeIndependentOutcomeWrite() {
        Order order = original();
        doThrow(new OrderProblem("INSUFFICIENT_CREDITS", "diagnostic"))
                .when(credits).reserve(any(), any(), eq(1L), any());
        TransactionSynchronizationManager.initSynchronization();
        List<TransactionSynchronization> callbacks;
        try {
            assertEquals("INSUFFICIENT_CREDITS", attempt(order).getCode());
            verifyNoInteractions(failures);
            callbacks = TransactionSynchronizationManager.getSynchronizations();
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
        callbacks.forEach(callback -> callback.afterCompletion(TransactionSynchronization.STATUS_COMMITTED));
        verifyNoInteractions(failures);
        callbacks.forEach(callback -> callback.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));
        verify(failures).record(eq(order.getId()), eq("INSUFFICIENT_CREDITS"), any());
    }

    @Test
    void recorderFailureDoesNotReplaceOriginalTransportError() {
        Order order = original();
        doThrow(new ResourceAccessException("private connection detail"))
                .when(suppliers).validatePair("pickup", "delivery", "token");
        doThrow(new IllegalStateException("database unavailable"))
                .when(failures).record(any(), any(), any());
        assertEquals("SERVICE_UNAVAILABLE", attempt(order).getCode());
        verifyNoInteractions(credits);
    }
}
