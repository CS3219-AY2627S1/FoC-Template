package sg.edu.nus.foc.order.api.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;
import sg.edu.nus.foc.common.penalty.PenaltySystemPolicy;

@Getter
@Setter
public class ApplyPenaltyRequest {
    @NotBlank @Size(max = 128) private String commandId;
    @NotBlank @Size(max = 128) private String courierId;
    @NotNull @PositiveOrZero private Long expectedVersion;
    @NotNull private PenaltySystemPolicy policy;
    @NotBlank @Size(max = 1000) private String reason;
}
