package sg.edu.nus.foc.credit.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CourierAssignmentRequest(
        @NotBlank @Size(max = 128) String courierId) {
}
