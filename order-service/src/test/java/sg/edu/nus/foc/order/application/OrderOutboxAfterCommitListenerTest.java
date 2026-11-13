package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;

class OrderOutboxAfterCommitListenerTest {
    @Test
    void publicationIsQueuedWithoutBlockingTheRequestThread() {
        OrderOutboxDispatcher dispatcher = mock(OrderOutboxDispatcher.class);
        java.util.List<Runnable> queued = new java.util.ArrayList<>();
        OrderOutboxAfterCommitListener listener = new OrderOutboxAfterCommitListener(dispatcher, queued::add);
        listener.dispatchAfterCommit(new OrderOutboxDispatchRequested("event-2"));
        org.mockito.Mockito.verifyNoInteractions(dispatcher);
        org.junit.jupiter.api.Assertions.assertEquals(1, queued.size());
        queued.get(0).run();
        verify(dispatcher).dispatch("event-2");
    }

    @Test
    void saturatedExecutorLeavesCommittedEventForRecoveryWithoutFailingResponse() {
        OrderOutboxDispatcher dispatcher = mock(OrderOutboxDispatcher.class);
        OrderOutboxAfterCommitListener listener = new OrderOutboxAfterCommitListener(dispatcher,
                task -> { throw new java.util.concurrent.RejectedExecutionException("full"); });
        assertDoesNotThrow(() -> listener.dispatchAfterCommit(new OrderOutboxDispatchRequested("event-3")));
        org.mockito.Mockito.verifyNoInteractions(dispatcher);
    }

    @Test
    void dispatchesRequestedEventAndDoesNotPropagatePostCommitFailure() {
        OrderOutboxDispatcher dispatcher = mock(OrderOutboxDispatcher.class);
        OrderOutboxAfterCommitListener listener = new OrderOutboxAfterCommitListener(dispatcher);
        OrderOutboxDispatchRequested request = new OrderOutboxDispatchRequested("event-1");
        doThrow(new IllegalStateException("database unavailable")).when(dispatcher).dispatch("event-1");

        assertDoesNotThrow(() -> listener.dispatchAfterCommit(request));

        verify(dispatcher).dispatch("event-1");
    }
}
