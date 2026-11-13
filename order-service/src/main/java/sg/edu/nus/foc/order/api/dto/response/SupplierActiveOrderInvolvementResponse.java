package sg.edu.nus.foc.order.api.dto.response;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class SupplierActiveOrderInvolvementResponse {

    private String supplierId;
    private boolean hasActiveOrders;
}
