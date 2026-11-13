package sg.edu.nus.foc.order.messagingpublisher.dto;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import sg.edu.nus.foc.common.penalty.PenaltySystemPolicy;

@Getter
@Setter
@NoArgsConstructor
public class PenaltyScoreDeductionEvent implements OrderTaskEvent {

    private String eventId;
    private String eventType;
    private String orderId;
    private String courierId;
    private int penaltyAmount;
    private Instant occurredAt;
    private PenaltySystemPolicy appliedReason;
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private Long courierSequence;

    @JsonIgnore
    private int eventVersion;

    @JsonIgnore
    private long orderVersion;
}
