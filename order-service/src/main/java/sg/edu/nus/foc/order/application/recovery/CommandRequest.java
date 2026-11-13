package sg.edu.nus.foc.order.application.recovery;

import java.time.Instant;
import sg.edu.nus.foc.order.domain.RepostPlan;

/** Immutable Order input. This is NOT the Credit request body. No credentials. */
public record CommandRequest(String kind, String actorId, String orderId,
                             long expectedVersion, Creation creation) {
    public record Creation(String description, String pickup, String delivery, long amount,
                           int duration, Instant expiresAt, boolean automaticRepost,
                           Instant repostDueAt, long repostCredits, int repostDuration,
                           Instant repostExpiresAt) {
        public RepostPlan plan() {
            return automaticRepost ? new RepostPlan(true, repostDueAt, repostCredits,
                    repostDuration, repostExpiresAt) : null;
        }
    }
}
