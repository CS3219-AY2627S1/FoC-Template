package sg.edu.nus.foc.order.application.recovery;

import com.fasterxml.jackson.annotation.JsonInclude;

/** ADR-054: C identifies compensation; K remains the original immutable action. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record CreditCompensationRequest(String eventId, String commandId, String operation,
        String orderId, String actorId, long generation, Long amount) { }
