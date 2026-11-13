package sg.edu.nus.foc.order.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import sg.edu.nus.foc.order.application.recovery.*;
import sg.edu.nus.foc.order.api.dto.request.*;
import sg.edu.nus.foc.order.domain.OrderProblem;

class OrderCommandControllerTest {
    private final OrderCommandService service = mock(OrderCommandService.class);
    private final OrderCommandController controller = new OrderCommandController(service);
    private CommandView view(String status) {
        return new CommandView("K", "CREATE", status, status.equals("COMPLETED") ? "REJECTED" : null,
                "test", "safe message", "candidate", 1, Instant.now(), null);
    }
    @Test void mapsAllThreeMinimalCommandsAndReturnsPendingOrTerminal() {
        when(service.submit(anyString(), any(), eq("Bearer current"))).thenReturn(view("PENDING"), view("COMPLETED"), view("PENDING"));
        var input = new CreateOrderRequest("K", "owner", "item", "p", "d", 5, 15,
                Instant.now().plusSeconds(3600), false, null, 0, 0, null);
        assertEquals(202, controller.create(input, "Bearer current").getStatusCode().value());
        verify(service).submit(eq("K"), argThat(r -> r.kind().equals("CREATE") && r.creation().amount() == 5 && r.actorId().equals("owner")), eq("Bearer current"));
        var actor = new OrderActorRequest("K", "courier", 7);
        assertEquals(200, controller.accept("order", actor, "Bearer current").getStatusCode().value());
        assertEquals(202, controller.abort("order", actor, "Bearer current").getStatusCode().value());
        verify(service).submit(eq("K"), argThat(r -> r.kind().equals("ABORT") && r.orderId().equals("order") && r.expectedVersion() == 7), eq("Bearer current"));
    }
    @Test void exposesReadOnlyDiscoveryStatusAndExplicitResume() {
        assertEquals(false, controller.capabilities().get("enabled"));
        when(service.enabled()).thenReturn(true);
        assertEquals(true, controller.capabilities().get("enabled"));
        when(service.status("K", "owner", "auth")).thenReturn(view("PENDING"));
        assertEquals("PENDING", controller.status("K", "owner", "auth").status());
        when(service.resume("K", "owner", "auth")).thenReturn(view("COMPLETED"));
        assertEquals(200, controller.resume("K", "owner", "auth").getStatusCode().value());
        when(service.pending("owner", "auth", 1, 20)).thenReturn(List.of(view("PENDING")));
        when(service.pendingCount("owner")).thenReturn(21L);
        assertEquals(2L, controller.pending("owner", 1, 20, "auth").get("totalPages"));
        for (int[] values : new int[][] {{0, 20}, {1, 0}, {1, 101}}) {
            assertThrows(OrderProblem.class, () -> controller.pending("owner", values[0], values[1], "auth"));
        }
    }
    @Test void manualRepostKeepsOriginalTargetAndOnlyFreezesSubmittedFields() {
        Instant expiry = Instant.now().plusSeconds(3600);
        ManualRepostRequest input = new ManualRepostRequest("R", "owner", 3, "edited", 7, 30, expiry);
        when(service.submit(eq("R"), any(), eq("auth"))).thenReturn(view("PENDING"), view("COMPLETED"));
        assertEquals(202, controller.repost("original", input, "auth").getStatusCode().value());
        assertEquals(200, controller.repost("original", input, "auth").getStatusCode().value());
        verify(service, times(2)).submit(eq("R"), argThat(r -> r.kind().equals("REPOST")
                && r.orderId().equals("original") && r.actorId().equals("owner") && r.expectedVersion() == 3
                && r.creation().amount() == 7 && r.creation().expiresAt().equals(expiry)
                && r.creation().pickup() == null && r.creation().delivery() == null), eq("auth"));
    }
}
