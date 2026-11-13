package sg.edu.nus.foc.order.api.dto.response;

import java.time.Instant;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class RepostDraftResponse {
    private String originalOrderId;
    private String itemDescription;
    private String pickupSupplierId;
    private String deliverySupplierId;
    private long offeredCredits;
    private int deliveryTimeLimitMinutes;
    private Instant expiresAt;
}
