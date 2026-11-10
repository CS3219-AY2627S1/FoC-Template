package sg.edu.nus.foc.user.event;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class SequencedPenaltyProcessor {
    private final PenaltySequenceStore store;

    public void receive(PenaltyScoreEvent event) {
        store.accept(event); // A push is acknowledged only after the receipt transaction commits.
        drain(event.courierId());
    }

    @Scheduled(fixedDelayString = "${USER_PENALTY_SEQUENCE_RECOVERY_DELAY_MS:10000}",
            initialDelayString = "${USER_PENALTY_SEQUENCE_RECOVERY_DELAY_MS:10000}")
    public void recover() {
        try { store.pendingStreams().forEach(this::drain); }
        catch (RuntimeException failure) { log.warn("Penalty inbox recovery will retry", failure); }
    }

    private void drain(String courierId) {
        try {
            for (int count = 0; count < 100 && store.applyNext(courierId); count++) { }
        } catch (RuntimeException failure) {
            // Receipt is already durable. A fresh transaction in the timer retries the exact position.
            log.warn("Penalty stream {} remains pending for recovery", courierId, failure);
            try { store.deferRetry(courierId); }
            catch (RuntimeException unavailable) {
                log.warn("Could not update retry time for penalty stream {}", courierId, unavailable);
            }
        }
    }
}
