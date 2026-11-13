package sg.edu.nus.foc.order.api.dto.response;

import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class OrderPageResponse {
    private List<OrderResponse> items;
    private int page;
    private int size;
    private long totalItems;
    private int totalPages;
}
