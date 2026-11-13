package sg.edu.nus.foc.order.application;

import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import sg.edu.nus.foc.order.api.mapper.OrderMapper;
import sg.edu.nus.foc.order.application.recovery.*;
import sg.edu.nus.foc.order.domain.repository.*;

class CompensationPolicyCutoverTest {
    private final OrderCommandStore store = mock(OrderCommandStore.class);
    private final UserServicePort users = mock(UserServicePort.class);
    private final OrderCompensationJournal journal = mock(OrderCompensationJournal.class);
    @SuppressWarnings("unchecked")
    private final ObjectProvider<CreditCommandGateway> gateway = mock(ObjectProvider.class);
    private final OrderCommandService service = new OrderCommandService(store, mock(OrderRepository.class),
            mock(CommandReceiptRepository.class), mock(OrderCreationService.class), mock(OrderAssignmentService.class),
            mock(OrderTransitionService.class), mock(OrderRepostService.class), users, mock(SupplierServicePort.class),
            gateway, mock(PlatformTransactionManager.class), mock(OrderMapper.class), mock(OrderAuditLogger.class));
    CompensationPolicyCutoverTest() {
        ReflectionTestUtils.setField(service, "mode", "mock");
        ReflectionTestUtils.setField(service, "flag", true);
        ReflectionTestUtils.setField(service, "batchSize", 20);
        ReflectionTestUtils.setField(service, "compensationJournal", journal);
        when(gateway.getIfAvailable()).thenReturn(mock(CreditCommandGateway.class));
    }
    @Test void newCompensationPolicyStillClaimsAnExistingRetryCommand() {
        ReflectionTestUtils.setField(service, "recoveryPolicy", "compensate");
        CommandRequest input = new CommandRequest("CREATE", "actor", null, 0,
                new CommandRequest.Creation("task", "pickup", "delivery", 5, 15,
                        Instant.now().plusSeconds(7200), false, null, 0, 0, null));
        OrderCommandStore.Entry saved = new OrderCommandStore.Entry("K", "actor", "CREATE", "O", input,
                "hash", "PENDING", null, "RETRY_SCHEDULED", "Waiting", 1, 1, null, null,
                Instant.now(), false, null, null, Instant.now());
        when(store.get("K")).thenReturn(saved);
        when(store.recoveryPolicy("K")).thenReturn("RETRY");
        when(users.verifyRequester("actor", "auth")).thenReturn("actor");
        when(store.claim(eq("K"), anyString(), anyInt(), eq(true))).thenReturn(Optional.empty());
        service.resume("K", "actor", "auth");
        verify(store).claim(eq("K"), anyString(), anyInt(), eq(true));
    }
    @Test void recoveryDrainsBothPersistedPoliciesRegardlessOfNewCommandPolicy() {
        for (String policy : java.util.List.of("retry", "compensate")) {
            clearInvocations(store, journal);
            ReflectionTestUtils.setField(service, "recoveryPolicy", policy);
            service.recoverDue();
            verify(journal).due(20);
            verify(store).due(20);
        }
    }
}
