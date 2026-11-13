package sg.edu.nus.foc.order.application.adminmock;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Service;
import sg.edu.nus.foc.order.api.dto.response.ReportDemoOrderResponse;
import sg.edu.nus.foc.order.api.mapper.ReportDemoMapper;
import sg.edu.nus.foc.order.config.ReportDemoCondition;
import sg.edu.nus.foc.order.domain.OrderProblem;

/** Private fixtures for local Reports only. No real orders, users, suppliers, funds or score changes. */
@Service
@Conditional(ReportDemoCondition.class)
@RequiredArgsConstructor
public class ReportDemoOrderStore {
    private final ReportDemoMapper mapper;
    private final Map<String, ReportDemoOrderResponse> orders = new LinkedHashMap<>();

    public synchronized ReportDemoOrderResponse sampleOrder(String id) {
        ReportDemoOrderResponse order = orders.get(id);
        if (order == null) throw OrderProblem.notFound("Sample order not found.");
        return mapper.copyOrder(order);
    }

    public synchronized void reportHold(String id, boolean held) {
        ReportDemoOrderResponse order = orders.get(id);
        if (order == null) throw OrderProblem.notFound("Sample order not found.");
        order.setCompletionHold(held);
    }

    public synchronized List<ReportDemoOrderResponse> reportFixtures(String userId) {
        if (userId == null || userId.isBlank() || userId.length() > 128)
            throw new OrderProblem("VALIDATION_ERROR", "A sample user ID is required.");
        String suffix = UUID.nameUUIDFromBytes(userId.getBytes(StandardCharsets.UTF_8)).toString();
        List<ReportDemoOrderResponse> result = new ArrayList<>();
        Instant now = Instant.now();
        for (int index = 0; index < 4; index++) {
            String id = "demo-report-order-" + index + "-" + suffix;
            ReportDemoOrderResponse order = orders.get(id);
            if (order == null) {
                order = new ReportDemoOrderResponse();
                order.setId(id);
                order.setRequesterId(index < 2 ? userId : "demo-user-001");
                order.setRequesterName(index < 2 ? "You (sample)" : "Alex Tan");
                order.setCourierId(index < 2 ? "demo-user-002" : userId);
                order.setCourierName(index < 2 ? "Jamie Lee" : "You (sample)");
                order.setItemDescription("Collect lunch from The Deck");
                order.setPickupSupplierId("demo-supplier-001");
                order.setPickupSupplierName("The Deck");
                order.setDeliverySupplierId("demo-supplier-002");
                order.setDeliverySupplierName("Central Library");
                order.setOfferedCredits(9);
                order.setStatus("DELIVERED");
                order.setCreatedAt(now.minusSeconds(36000));
                order.setExpiresAt(now.minusSeconds(28800));
                order.setDeliveryTimeLimitMinutes(45);
                order.setDeliveryDeadlineAt(now.minusSeconds(34500));
                order.setDeliveredAt(now.minusSeconds(34000));
                order.setOverdue(true);
                order.setVersion(0);
                orders.put(id, order);
            }
            result.add(mapper.copyOrder(order));
        }
        return result;
    }
}
