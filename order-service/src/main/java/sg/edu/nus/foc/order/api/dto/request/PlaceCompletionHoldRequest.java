package sg.edu.nus.foc.order.api.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import lombok.Getter;
import lombok.Setter;
import jakarta.validation.constraints.NotBlank;

@Getter
@Setter
public class PlaceCompletionHoldRequest {
    @NotNull private Boolean requireAssignedCourier;
    @NotNull @Pattern(regexp = "REQUESTER|COURIER|PARTICIPANT")
    private String reporterRole = "REQUESTER";
    @NotBlank @Pattern(regexp="[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")
    private String submissionId;
}
