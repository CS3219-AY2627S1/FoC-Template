package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import sg.edu.nus.foc.order.api.mapper.OrderMapper;
import sg.edu.nus.foc.order.application.recovery.*;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.repository.*;

class OrderCommandGateTest {
    private final OrderCommandStore store = mock(OrderCommandStore.class);
    private final UserServicePort users = mock(UserServicePort.class);
    @SuppressWarnings("unchecked")
    private final ObjectProvider<CreditCommandGateway> gateway = mock(ObjectProvider.class);
    private final OrderCommandService service = new OrderCommandService(store, mock(OrderRepository.class),
        mock(CommandReceiptRepository.class), mock(OrderCreationService.class), mock(OrderAssignmentService.class),
        mock(OrderTransitionService.class), mock(OrderRepostService.class), users, mock(SupplierServicePort.class), gateway,
        mock(PlatformTransactionManager.class), mock(OrderMapper.class), mock(OrderAuditLogger.class));
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }
    @Test void verifiedHttpGatewayEnablesRecoveryWithoutAStub() {
        ReflectionTestUtils.setField(service, "mode", "http");
        ReflectionTestUtils.setField(service, "flag", true);
        when(gateway.getIfAvailable()).thenReturn(mock(CreditCommandGateway.class));
        assertTrue(service.enabled());
        ReflectionTestUtils.setField(service, "flag", false);
        assertFalse(service.enabled());
        ReflectionTestUtils.setField(service, "flag", true);
        when(gateway.getIfAvailable()).thenReturn(null);
        assertFalse(service.enabled());
    }
    @Test void ownerCanReadPastCourierOutcomeWithoutNewTaskEligibility() {
        var input = new CommandRequest("ABORT", "courier", "order", 0, null);
        when(store.get("K")).thenReturn(new OrderCommandStore.Entry("K", "courier", "ABORT", "order", input,
            "hash", "COMPLETED", "SUCCESS", "SUCCEEDED", "Done", 1, 1, null, null, Instant.now(), true, null, null, Instant.now()));
        var jwt = Jwt.withTokenValue("validated").header("alg", "RS256").subject("courier").build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt,
                List.of(new SimpleGrantedAuthority("ROLE_COURIER"))));
        when(users.verifyCourier("courier", "auth")).thenThrow(OrderProblem.forbidden("Not eligible for new tasks"));
        assertEquals("SUCCESS", service.status("K", "courier", "auth").outcome());
        verifyNoInteractions(users);
        assertThrows(OrderProblem.class, () -> service.status("K", "other", "auth"));
    }

    @Test void compensationFixturesCanNeverEnableUnverifiedHttpRecovery() {
        ReflectionTestUtils.setField(service, "recoveryPolicy", "compensate");
        ReflectionTestUtils.setField(service, "flag", true);
        when(gateway.getIfAvailable()).thenReturn(mock(CreditCommandGateway.class));
        ReflectionTestUtils.setField(service, "mode", "http");
        assertFalse(service.enabled());
        assertThrows(OrderProblem.class, () -> service.submit("K", new CommandRequest("ACCEPT", "u", "O", 0, null), "auth"));
        verifyNoInteractions(store, users);
        ReflectionTestUtils.setField(service, "mode", "mock");
        assertTrue(service.enabled());
    }
}
