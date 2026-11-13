package sg.edu.nus.foc.order.domain;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class ActiveOrderInvolvement {

    private final String subjectId;
    private final boolean hasActiveOrders;
}
