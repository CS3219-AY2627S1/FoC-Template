package sg.edu.nus.foc.order.messagingpublisher.dto;

import java.time.Instant;

import lombok.AllArgsConstructor;
import lombok.Getter;

import sg.edu.nus.foc.common.penalty.PenaltySystemPolicy;

/** Internal mapping input; never serialized or published. */
@Getter
@AllArgsConstructor
public class CourierPenaltyEventFacts {

    private final String eventId;
    private final String orderId;
    private final String courierId;
    private final int penaltyAmount;
    private final Instant occurredAt;
    private final PenaltySystemPolicy appliedReason;
    private final long orderVersion;
    private final long courierSequence;
}
