package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import sg.edu.nus.foc.order.application.recovery.*;
import sg.edu.nus.foc.order.api.dto.response.OrderResponse;

/** Contract fixtures prove Order orchestration, not Credit/PostgreSQL behavior. */
class OrderCompensationWorkflowTest {
    final OrderCommandStore store = mock(OrderCommandStore.class);
    final OrderCompensationJournal journal = mock(OrderCompensationJournal.class);
    final CreditCommandGateway gateway = mock(CreditCommandGateway.class);
    @SuppressWarnings("unchecked") final ObjectProvider<CreditCommandGateway> provider = mock(ObjectProvider.class);
    final PlatformTransactionManager tx = mock(PlatformTransactionManager.class);
    final OrderCompensationWorkflow workflow;

    OrderCompensationWorkflowTest() {
        when(provider.getObject()).thenReturn(gateway);
        when(tx.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        workflow = new OrderCompensationWorkflow(store, journal, provider, tx);
    }
    OrderCommandStore.Entry claim(int attempts, boolean possible) {
        return new OrderCommandStore.Entry("K", "courier", "ACCEPT", "O",
                new CommandRequest("ACCEPT", "courier", "O", 0, null), "hash", "PENDING", null,
                "PROCESSING", "Pending", attempts, attempts, "worker", Instant.now().plusSeconds(120),
                Instant.now(), possible, null, null, Instant.now());
    }
    final CreditCommandGateway.Mutation mutation = new CreditCommandGateway.Mutation("ACCEPT", "O", "courier", 0);

    @Test void successfulLocalCommitCompletesWithTheSavedResult() {
        var claim = claim(1, false);
        when(gateway.execute("K", mutation, 1, "auth")).thenReturn(CreditCommandGateway.Result.success());
        OrderResponse result = new OrderResponse();
        workflow.execute(claim, mutation, "auth", () -> {}, () -> result);
        verify(journal).remoteSucceeded(claim);
        verify(journal).localSucceeded(claim);
        verify(store).complete(claim, "SUCCESS", "SUCCEEDED", "Request completed.", result);
        verify(journal, never()).abandon(any(), anyString());
    }
    @Test void remoteTimeoutRequestsCompensationWithoutRetryingTheFinancialOperation() {
        var claim = claim(1, false);
        when(gateway.execute(anyString(), any(), anyLong(), any())).thenThrow(new IllegalStateException("lost reply"));
        workflow.execute(claim, mutation, "auth", () -> {}, () -> fail("must not finalize"));
        verify(gateway, times(1)).execute(anyString(), any(), anyLong(), any());
        verify(gateway, never()).compensate(anyString(), any(), anyLong(), any());
        verify(journal).abandon(eq(claim), anyString());
        verify(store, never()).complete(any(), any(), any(), any(), any());
    }
    @Test void financialSuccessFollowedByLocalFailureRequestsCompensation() {
        var claim = claim(1, false);
        when(gateway.execute(anyString(), any(), anyLong(), any())).thenReturn(CreditCommandGateway.Result.success());
        workflow.execute(claim, mutation, "auth", () -> {}, () -> { throw new IllegalStateException("local rollback"); });
        verify(journal).remoteSucceeded(claim);
        verify(journal).abandon(eq(claim), anyString());
        verify(store, never()).complete(any(), any(), any(), any(), any());
    }
    @Test void authoritativeBusinessRejectionClosesWithoutSendingCompensation() {
        var claim = claim(1, false);
        when(gateway.execute(anyString(), any(), anyLong(), any()))
                .thenReturn(CreditCommandGateway.Result.rejection("INSUFFICIENT_CREDITS"));
        workflow.execute(claim, mutation, "auth", () -> {}, () -> fail("must not finalize"));
        verify(journal).rejected(claim, "INSUFFICIENT_CREDITS");
        verify(journal, never()).abandon(any(), anyString());
    }
    @Test void reclaimedCommandNeverCallsCreditAgain() {
        var claim = claim(2, true);
        workflow.execute(claim, mutation, "auth", () -> fail("must not validate a new execution"), () -> fail("must not finalize"));
        verify(journal).abandon(eq(claim), anyString());
        verifyNoInteractions(gateway);
    }
    @Test void preCallValidationFailureNeverInvokesCredit() {
        var claim = claim(1, false);
        workflow.execute(claim, mutation, "auth", () -> { throw new IllegalArgumentException("own order"); }, () -> fail("must not finalize"));
        verify(journal).abandon(eq(claim), anyString());
        verifyNoInteractions(gateway);
    }

    @Test void heldOrderValidationPreservesItsBusinessMessageWithoutCallingCredit() {
        OrderCommandStore.Entry claim = claim(1, false);
        String message = "This order has an active report. It must be resolved before you can cancel or abort the order.";
        workflow.execute(claim, mutation, "auth", () -> {
            throw new sg.edu.nus.foc.order.domain.OrderProblem("ORDER_ON_HOLD", message);
        }, () -> fail("must not finalize"));
        verify(journal).abandon(claim, "ORDER_ON_HOLD", message);
        verifyNoInteractions(gateway);
    }
}
