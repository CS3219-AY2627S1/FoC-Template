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
public class ManualRepostRequest {
    @NotBlank
    @jakarta.validation.constraints.Size(max = 128, message = "Command ID must be at most 128 characters.")
    private String commandId;

    @NotBlank
    private String actorId;

    @Min(0)
    private long expectedVersion;

    @NotBlank
    private String itemDescription;

    @Min(1)
    private long offeredCredits;

    @Min(15)
    private int deliveryTimeLimitMinutes;

    @NotNull
    private Instant expiresAt;
}
