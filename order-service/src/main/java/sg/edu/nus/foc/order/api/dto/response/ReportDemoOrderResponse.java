package sg.edu.nus.foc.order.api.dto.response;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class ReportDemoOrderResponse extends OrderResponse {

    private String requesterName;
    private String courierName;
    private String pickupSupplierName;
    private String deliverySupplierName;
}
