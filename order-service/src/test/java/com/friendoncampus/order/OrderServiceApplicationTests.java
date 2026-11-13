package com.friendoncampus.order;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.friendoncampus.order.repository.OrderRepository;
import com.friendoncampus.order.repository.OrderTransitionRepository;
import com.friendoncampus.order.repository.OutboxEventRepository;
import com.friendoncampus.order.repository.ProcessedEventRepository;

@SpringBootTest(properties = {
        "spring.autoconfigure.exclude="
                + "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration,"
                + "org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration,"
                + "org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration",
                "app.orders.expiry.enabled=false",
                "app.kafka.enabled=false"
})
class OrderServiceApplicationTests {
    @MockitoBean com.friendoncampus.order.dispute.DisputeBus disputeBus;

    @MockitoBean
    private OrderRepository orderRepository;

    @MockitoBean
    private OrderTransitionRepository orderTransitionRepository;

    @MockitoBean
    private OutboxEventRepository outboxEventRepository;

    @MockitoBean
    private ProcessedEventRepository processedEventRepository;

    @MockitoBean com.friendoncampus.order.service.DisputeReviewService disputeReviews;

    @Test
    void contextLoads() {
    }
}
