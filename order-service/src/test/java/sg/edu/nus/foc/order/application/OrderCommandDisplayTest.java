package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.PlatformTransactionManager;
import sg.edu.nus.foc.order.api.mapper.OrderMapper;
import sg.edu.nus.foc.order.application.recovery.*;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.repository.*;
import tools.jackson.databind.json.JsonMapper;

class OrderCommandDisplayTest {
    final OrderCommandStore store = mock(OrderCommandStore.class);
    final OrderRepository orders = mock(OrderRepository.class);
    final UserServicePort users = mock(UserServicePort.class);
    @SuppressWarnings("unchecked") final ObjectProvider<CreditCommandGateway> gateway = mock(ObjectProvider.class);
    final OrderCommandService service = new OrderCommandService(store, orders,
        mock(CommandReceiptRepository.class), mock(OrderCreationService.class), mock(OrderAssignmentService.class),
        mock(OrderTransitionService.class), mock(OrderRepostService.class), users, mock(SupplierServicePort.class), gateway,
        mock(PlatformTransactionManager.class), mock(OrderMapper.class), mock(OrderAuditLogger.class));
    final Instant now = Instant.parse("2026-10-11T10:00:00Z");
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }
    void authenticate(String owner) {
        var jwt = Jwt.withTokenValue("validated-secret-token").header("alg", "RS256").subject(owner).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt,
            List.of(new SimpleGrantedAuthority("ROLE_COURIER"))));
    }
    OrderCommandStore.Entry entry(String kind, CommandRequest.Creation creation) {
        return new OrderCommandStore.Entry("K", "owner", kind, "target", new CommandRequest(kind, "owner", "target", 0, creation),
            "secret-hash", "PENDING", null, "AUTHORIZATION_REQUIRED", "Continue", 2, 4,
            "secret-worker", now, now, true, null, "candidate", now);
    }
    @Test void frozenCreationAndRepostDetailsAreSafeAndDoNotPretendAnOrderExists() {
        authenticate("owner");
        var input = new CommandRequest.Creation("Submitted edit", "pickup", "delivery", 7, 30, now, false, null, 0, 0, null);
        for (String kind : List.of("CREATE", "REPOST")) {
            when(store.get("K")).thenReturn(entry(kind, input));
            var json = JsonMapper.builder().build().valueToTree(service.status("K", "owner", "auth"));
            assertEquals("Submitted edit", json.path("displayDetails").path("itemDescription").asText());
            assertEquals(7, json.path("displayDetails").path("offeredCredits").asInt());
            assertTrue(json.path("displayDetails").path("orderStatus").isNull());
            assertFalse(json.toString().contains("secret-"));
            assertFalse(json.has("input"));
        }
        verifyNoInteractions(orders, users);
    }
    @Test void acceptAndAbortShowCommittedTargetEvenAfterDeadlineWithoutNewEligibilityLookup() {
        authenticate("owner");
        Order target = Order.open("requester", "Existing target", "pickup", "delivery", 3, 15, now.minusSeconds(7200), now.minusSeconds(3600));
        when(orders.get("target")).thenReturn(Optional.of(target));
        for (String kind : List.of("ACCEPT", "ABORT")) {
            var pending = entry(kind, null);
            when(store.get("K")).thenReturn(pending);
            when(store.pendingFor("owner", 1, 20)).thenReturn(List.of(pending));
            var json = JsonMapper.builder().build().valueToTree(service.pending("owner", "auth", 1, 20).getFirst());
            assertEquals("Existing target", json.path("displayDetails").path("itemDescription").asText());
            assertEquals("OPEN", json.path("displayDetails").path("orderStatus").asText());
            assertEquals(0, json.path("displayDetails").path("version").asInt());
        }
        verifyNoInteractions(users);
    }
    @Test void ownerCheckPrecedesTargetReadAndMissingTargetHasNullProjection() {
        authenticate("owner");
        when(store.get("K")).thenReturn(entry("ACCEPT", null));
        assertThrows(OrderProblem.class, () -> service.status("K", "another-user", "auth"));
        verifyNoInteractions(orders);
        when(orders.get("target")).thenReturn(Optional.empty());
        var json = JsonMapper.builder().build().valueToTree(service.status("K", "owner", "auth"));
        assertTrue(json.path("displayDetails").isNull());
        assertEquals("PENDING", json.path("status").asText());
    }
}
