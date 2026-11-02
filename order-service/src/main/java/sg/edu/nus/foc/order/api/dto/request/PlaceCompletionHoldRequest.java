package sg.edu.nus.foc.order.api.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class PlaceCompletionHoldRequest {
    @NotNull private Boolean requireAssignedCourier;
    @NotNull @Pattern(regexp = "REQUESTER|COURIER|PARTICIPANT")
    private String reporterRole = "REQUESTER";
}
