package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.time.Instant;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import sg.edu.nus.foc.order.application.recovery.OrderCommandService;

class OrderLifecycleSchedulerTest {
    @Test
    void runsRecoveryThenBothChecksInOrderWithOneCapturedTime() {
        LifecycleProcessingService lifecycle = mock(LifecycleProcessingService.class);
        OrderCommandService commands = mock(OrderCommandService.class);
        when(lifecycle.expireDue(any())).thenReturn(2);
        when(lifecycle.autoCompleteDue(any())).thenReturn(3);
        new OrderLifecycleScheduler(lifecycle, commands).processDueOrders();

        ArgumentCaptor<Instant> expiry = ArgumentCaptor.forClass(Instant.class);
        ArgumentCaptor<Instant> completion = ArgumentCaptor.forClass(Instant.class);
        InOrder inOrder = inOrder(commands, lifecycle);
        inOrder.verify(commands).recoverDue();
        inOrder.verify(lifecycle).expireDue(expiry.capture());
        inOrder.verify(lifecycle).autoCompleteDue(completion.capture());
        inOrder.verify(lifecycle).repostDue(completion.getValue(), null);
        assertEquals(expiry.getValue(), completion.getValue());
        verifyNoMoreInteractions(commands, lifecycle);
    }

    @Test
    void repostFailureDoesNotPreventTheNextLifecyclePass() {
        LifecycleProcessingService lifecycle = mock(LifecycleProcessingService.class);
        OrderCommandService commands = mock(OrderCommandService.class);
        when(lifecycle.repostDue(any(), isNull())).thenThrow(new IllegalStateException("repost unavailable"));
        OrderLifecycleScheduler scheduler = new OrderLifecycleScheduler(lifecycle, commands);
        assertDoesNotThrow(scheduler::processDueOrders);
        assertDoesNotThrow(scheduler::processDueOrders);
        verify(commands, times(2)).recoverDue();
        verify(lifecycle, times(2)).expireDue(any());
        verify(lifecycle, times(2)).autoCompleteDue(any());
        verify(lifecycle, times(2)).repostDue(any(), isNull());
    }

    @Test
    void lifecycleTimeIsCapturedAfterRecoveryReturns() {
        LifecycleProcessingService lifecycle = mock(LifecycleProcessingService.class);
        OrderCommandService commands = mock(OrderCommandService.class);
        AtomicReference<Instant> recoveryFinished = new AtomicReference<>();
        doAnswer(invocation -> {
            recoveryFinished.set(Instant.now());
            return null;
        }).when(commands).recoverDue();

        new OrderLifecycleScheduler(lifecycle, commands).processDueOrders();

        ArgumentCaptor<Instant> expiry = ArgumentCaptor.forClass(Instant.class);
        verify(lifecycle).expireDue(expiry.capture());
        assertFalse(expiry.getValue().isBefore(recoveryFinished.get()));
        verify(lifecycle).autoCompleteDue(expiry.getValue());
    }

    @Test
    void recoveryFailureDoesNotSkipExpiryOrCompletion() {
        LifecycleProcessingService lifecycle = mock(LifecycleProcessingService.class);
        OrderCommandService commands = mock(OrderCommandService.class);
        doThrow(new IllegalStateException("recovery unavailable")).when(commands).recoverDue();

        assertDoesNotThrow(new OrderLifecycleScheduler(lifecycle, commands)::processDueOrders);

        InOrder inOrder = inOrder(commands, lifecycle);
        inOrder.verify(commands).recoverDue();
        inOrder.verify(lifecycle).expireDue(any());
        inOrder.verify(lifecycle).autoCompleteDue(any());
        inOrder.verify(lifecycle).repostDue(any(), isNull());
        verifyNoMoreInteractions(commands, lifecycle);
    }

    @Test
    void expiryFailureDoesNotSkipCompletion() {
        LifecycleProcessingService lifecycle = mock(LifecycleProcessingService.class);
        OrderCommandService commands = mock(OrderCommandService.class);
        when(lifecycle.expireDue(any())).thenThrow(new IllegalStateException("expiry unavailable"));
        when(lifecycle.autoCompleteDue(any())).thenReturn(1);
        assertDoesNotThrow(new OrderLifecycleScheduler(lifecycle, commands)::processDueOrders);
        verify(commands).recoverDue();
        verify(lifecycle).autoCompleteDue(any());
    }

    @Test
    void completionFailureDoesNotPreventNextPass() {
        LifecycleProcessingService lifecycle = mock(LifecycleProcessingService.class);
        OrderCommandService commands = mock(OrderCommandService.class);
        when(lifecycle.autoCompleteDue(any())).thenThrow(new IllegalStateException("completion unavailable"));
        OrderLifecycleScheduler scheduler = new OrderLifecycleScheduler(lifecycle, commands);
        assertDoesNotThrow(scheduler::processDueOrders);
        assertDoesNotThrow(scheduler::processDueOrders);
        verify(commands, times(2)).recoverDue();
        verify(lifecycle, times(2)).expireDue(any());
        verify(lifecycle, times(2)).autoCompleteDue(any());
    }

    @Test
    void everyPhaseFailureStillAllowsAllPhasesOnTheNextPass() {
        LifecycleProcessingService lifecycle = mock(LifecycleProcessingService.class);
        OrderCommandService commands = mock(OrderCommandService.class);
        doThrow(new IllegalStateException("recovery unavailable")).when(commands).recoverDue();
        when(lifecycle.expireDue(any())).thenThrow(new IllegalStateException("expiry unavailable"));
        when(lifecycle.autoCompleteDue(any())).thenThrow(new IllegalStateException("completion unavailable"));
        OrderLifecycleScheduler scheduler = new OrderLifecycleScheduler(lifecycle, commands);

        assertDoesNotThrow(scheduler::processDueOrders);
        assertDoesNotThrow(scheduler::processDueOrders);

        InOrder inOrder = inOrder(commands, lifecycle);
        for (int pass = 0; pass < 2; pass++) {
            inOrder.verify(commands).recoverDue();
            inOrder.verify(lifecycle).expireDue(any());
            inOrder.verify(lifecycle).autoCompleteDue(any());
            inOrder.verify(lifecycle).repostDue(any(), isNull());
        }
        verifyNoMoreInteractions(commands, lifecycle);
    }
}
