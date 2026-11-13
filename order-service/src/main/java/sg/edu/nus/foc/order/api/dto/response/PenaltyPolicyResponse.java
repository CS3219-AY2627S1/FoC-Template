package sg.edu.nus.foc.order.api.dto.response;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import sg.edu.nus.foc.common.penalty.PenaltySystemPolicy;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class PenaltyPolicyResponse {
    private PenaltySystemPolicy policy;
    private int penaltyAmount;
}
