package sg.edu.nus.foc.order.api.dto.request;

import java.util.List;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Pattern;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import sg.edu.nus.foc.common.penalty.PenaltySystemPolicy;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class AdminCancelOrderRequest {

    @NotBlank
    @Size(max = 128)
    private String requesterId;

    @Size(min = 1, max = 128)
    private String courierId;

    @Size(max = 32)
    private List<@NotNull PenaltySystemPolicy> appliedPenalties;

    @Size(max = 1000)
    @Pattern(regexp = "(?s).*\\S.*", message = "Admin reason must not be blank")
    private String resolutionReason;
}
