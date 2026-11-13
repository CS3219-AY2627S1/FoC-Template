package sg.edu.nus.foc.order.domain.repository;

import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Getter;
import sg.edu.nus.foc.order.domain.Order;

@Getter
@AllArgsConstructor
public class OrderPage {
    private final List<Order> items;
    private final int page;
    private final int size;
    private final long totalItems;
    private final int totalPages;
}
