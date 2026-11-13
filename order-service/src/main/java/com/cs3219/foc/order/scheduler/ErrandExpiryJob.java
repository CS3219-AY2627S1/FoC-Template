package com.cs3219.foc.order.scheduler;

import com.cs3219.foc.order.service.OrderService;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ErrandExpiryJob {
    private final OrderService orderService;

    @Scheduled(fixedDelayString = "${orders.expiry-scan-delay:10s}")
    public void expire() {
        orderService.expireOpenOrders();
    }
}
