package sg.edu.nus.foc.order.api;

import java.util.List;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import sg.edu.nus.foc.order.application.OrderOutboxAfterCommitListener;
import sg.edu.nus.foc.order.application.OrderOutboxDispatchRequested;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.repository.OrderEventOutboxRepository;

class OrderOutboxAdminControllerTest {
    @Test void listsBoundedIdsAndQueuesOnlyCommittedRedrives() {
        OrderEventOutboxRepository outbox = mock(OrderEventOutboxRepository.class);
        OrderOutboxAfterCommitListener publication = mock(OrderOutboxAfterCommitListener.class);
        OrderOutboxAdminController controller = new OrderOutboxAdminController(outbox, publication);
        when(outbox.failedIds(50)).thenReturn(List.of("failed"));
        assertEquals(List.of("failed"), controller.failed(50).get("eventIds"));
        assertThrows(OrderProblem.class, () -> controller.failed(0));
        assertThrows(OrderProblem.class, () -> controller.failed(101));
        assertEquals(202, controller.redrive("failed").getStatusCode().value());
        org.mockito.InOrder sequence = inOrder(outbox, publication);
        sequence.verify(outbox).redrive(eq("failed"), any());
        sequence.verify(publication).dispatchAfterCommit(new OrderOutboxDispatchRequested("failed"));
        doThrow(OrderProblem.conflict("Not failed")).when(outbox).redrive(eq("pending"), any());
        assertThrows(OrderProblem.class, () -> controller.redrive("pending"));
        verify(publication, never()).dispatchAfterCommit(new OrderOutboxDispatchRequested("pending"));
    }
}
