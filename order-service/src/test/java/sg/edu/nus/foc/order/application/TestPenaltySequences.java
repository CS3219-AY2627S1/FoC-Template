package sg.edu.nus.foc.order.application;

import java.util.HashMap;
import java.util.Map;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.anyString;

/** Unit fixture only; database serialization/rollback is verified separately. */
final class TestPenaltySequences {
    static CourierPenaltySequenceStore store() {
        Map<String, Long> counters = new HashMap<>();
        Map<String, Long> events = new HashMap<>();
        CourierPenaltySequenceStore store = mock(CourierPenaltySequenceStore.class);
        when(store.assign(anyString(), anyString())).thenAnswer(call -> events.computeIfAbsent(
                call.getArgument(1), key -> counters.merge(call.getArgument(0), 1L, Long::sum)));
        return store;
    }
}
