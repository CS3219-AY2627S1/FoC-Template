package sg.edu.nus.foc.order.api.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class CreateOrderRequest {
    @NotBlank(message = "A command ID is required.")
    @jakarta.validation.constraints.Size(max = 128, message = "Command ID must be at most 128 characters.")
    private String commandId;

    @NotBlank(message = "A verified requester is required.")
    private String requesterId;

    @NotBlank(message = "Describe what you need.")
    private String itemDescription;

    @NotBlank(message = "Select a pickup supplier.")
    private String pickupSupplierId;

    @NotBlank(message = "Select a delivery supplier.")
    private String deliverySupplierId;

    @Min(value = 1, message = "Offered credits must be at least 1.")
    private long offeredCredits;

    @Min(value = 15, message = "Delivery time must be at least 15 minutes.")
    private int deliveryTimeLimitMinutes;

    @NotNull(message = "Choose an order expiry time.")
    private Instant expiresAt;

    private boolean automaticRepost;
    private Instant repostDueAt;
    private long repostCreditAmount;
    private int repostDeliveryDurationMinutes;
    private Instant repostExpiresAt;
}
