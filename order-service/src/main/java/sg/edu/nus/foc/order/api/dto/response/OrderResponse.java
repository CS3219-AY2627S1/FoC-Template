package sg.edu.nus.foc.order.api.dto.response;

import java.time.Instant;
import com.fasterxml.jackson.annotation.JsonProperty;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class OrderResponse {
    private String id;
    private String attemptId;
    private String requesterId;
    private String courierId;
    private String itemDescription;
    private String pickupSupplierId;
    private String deliverySupplierId;
    private long offeredCredits;
    private String status;
    @JsonProperty("isCompletionHold")
    private boolean completionHold;
    @JsonProperty("isOverdue")
    @Schema(description = "Stored at actual delivery; null before delivery or when legacy timing is unavailable. A penalty waiver does not change this factual outcome.", nullable = true)
    private Boolean overdue;
    private boolean overduePenaltyWaived;
    private Instant overdueWaivedAt;
    private String overdueWaivedBy;
    private String overdueWaiverReason;
    @Schema(description = "Assigned courier START time plus delivery duration; null before START or when legacy timing is unknown.", nullable = true)
    private Instant deliveryDeadlineAt;
    @Schema(description = "Courier START time derived from the stored deadline and delivery duration; null before START or for unknown legacy timing.", nullable = true)
    private Instant startedAt;
    @Schema(description = "Actual courier delivery time; null before delivery or when legacy timing is unknown.", nullable = true)
    private Instant deliveredAt;
    private String appliedPenalty;
    private int appliedPenaltyAmount;
    private Instant appliedPenaltyAt;
    private String appliedPenaltyBy;
    private String appliedPenaltyReason;
    private String adminPenaltyDecision;
    private String adminPenaltyReason;
    private Integer adminPenaltyAmount;
    private Instant adminResolutionAt;
    private String adminResolutionReason;
    private Instant createdAt;
    private Instant expiresAt;
    private int deliveryTimeLimitMinutes;
    private long version;
    private String originalOrderId;
    private String repostedOrderId;
    private boolean automaticRepostEnabled;
    private Instant repostDueAt;
    private long repostCreditAmount;
    private int repostDeliveryDurationMinutes;
    private Instant repostExpiresAt;
    private String repostFailureCode;
    private String repostFailureMessage;
    private Instant repostFailureAt;
}
