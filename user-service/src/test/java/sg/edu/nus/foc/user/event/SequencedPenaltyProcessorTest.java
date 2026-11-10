package sg.edu.nus.foc.user.event;

import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class SequencedPenaltyProcessorTest {
    final PenaltySequenceStore store=mock(PenaltySequenceStore.class);
    final SequencedPenaltyProcessor processor=new SequencedPenaltyProcessor(store);
    final PenaltyScoreEvent event=new PenaltyScoreEvent("event","PenaltyScoreAdditionEvent","order","courier",2,Instant.EPOCH,"COURIER_BAD_ATTITUDE",1L);

    @Test void commitsReceiptBeforeAttemptingScoreAndRecoveryRetriesDurableFailure() {
        when(store.applyNext("courier")).thenThrow(new IllegalStateException("score unavailable"));
        assertDoesNotThrow(()->processor.receive(event));
        var ordered=inOrder(store);ordered.verify(store).accept(event);ordered.verify(store).applyNext("courier");
        ordered.verify(store).deferRetry("courier");
        when(store.pendingStreams()).thenReturn(List.of("courier"));
        doReturn(true,false).when(store).applyNext("courier");
        processor.recover();verify(store,times(3)).applyNext("courier");
    }
    @Test void failedReceiptPropagatesAndOneBrokenCourierDoesNotStopOthers() {
        doThrow(new IllegalStateException("receipt unavailable")).when(store).accept(event);
        assertThrows(IllegalStateException.class,()->processor.receive(event));
        verify(store,never()).applyNext(anyString());
        when(store.pendingStreams()).thenReturn(List.of("courier","other"));
        when(store.applyNext("courier")).thenThrow(new IllegalStateException("gap"));
        processor.recover();verify(store).applyNext("other");
    }
    @Test void unavailableRetryTimestampStillAllowsOtherCouriersToRecover() {
        when(store.pendingStreams()).thenReturn(List.of("courier","other"));
        when(store.applyNext("courier")).thenThrow(new IllegalStateException("score failed"));
        doThrow(new IllegalStateException("database unavailable")).when(store).deferRetry("courier");
        assertDoesNotThrow(processor::recover);
        verify(store).applyNext("other");
    }
}
