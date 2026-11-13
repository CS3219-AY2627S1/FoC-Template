package sg.edu.nus.foc.order.infrastructure;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mapstruct.factory.Mappers;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import sg.edu.nus.foc.order.application.CreditServicePort;
import sg.edu.nus.foc.order.application.OrderRepostService;
import sg.edu.nus.foc.order.api.mapper.OrderMapper;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.domain.RepostPlan;

@SpringBootTest(properties = {"spring.profiles.active=local", "order.messaging.outbox.recovery-cron=-", "order.lifecycle.cron=-"})
@Import(RepostOutcomeJpaIntegrationTest.CreditFixture.class)
@Testcontainers(disabledWithoutDocker = true)
class RepostOutcomeJpaIntegrationTest {
    @Container
    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:15-alpine");

    @TestConfiguration
    static class CreditFixture {
        @Bean
        @Primary
        CreditServicePort testCredit() {
            return mock(CreditServicePort.class);
        }
    }

    @Autowired private JpaOrderRepository orders;
    @Autowired private OrderRepostService reposts;
    @Autowired private CreditServicePort credits;
    @Autowired private org.springframework.jdbc.core.JdbcTemplate jdbc;

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @BeforeEach
    void resetCredit() {
        reset(credits);
    }

    private Order expired(RepostPlan plan) {
        Instant now = Instant.now();
        Order order = Order.open("owner", "item", "pickup", "delivery", 1, 15,
                now.minusSeconds(7200), now.minusSeconds(3600), plan);
        order.expire(0, now);
        return orders.saveAndFlush(order);
    }

    @Test
    void failedManualAttemptCommitsOnlyLatestFailureAndSuccessClearsIt() {
        Order original = expired(null);
        long count = orders.count();
        doThrow(new OrderProblem("INSUFFICIENT_CREDITS", "private peer diagnostic"))
                .when(credits).reserve(anyString(), anyString(), anyLong(), any());
        assertThrows(OrderProblem.class, () -> reposts.manual("fail-1", original.getId(), "owner", original.getVersion(),
                "updated", 2, 15, Instant.now().plusSeconds(3600), null));
        Order first = orders.findById(original.getId()).orElseThrow();
        assertEquals(OrderStatus.EXPIRED, first.getStatus());
        assertNull(first.getRepostedOrderId());
        assertEquals(count, orders.count());
        assertEquals("Repost failed: insufficient available credits.", first.getRepostFailureMessage());
        assertNotNull(first.getRepostFailureAt());
        assertEquals(first.getRepostFailureMessage(), Mappers.getMapper(OrderMapper.class).toResponse(first).getRepostFailureMessage());

        doThrow(new OrderProblem("SERVICE_UNAVAILABLE", "secret transport detail"))
                .when(credits).reserve(anyString(), anyString(), anyLong(), any());
        assertThrows(OrderProblem.class, () -> reposts.manual("fail-2", first.getId(), "owner", first.getVersion(),
                "updated", 2, 15, Instant.now().plusSeconds(3600), null));
        Order second = orders.findById(first.getId()).orElseThrow();
        assertEquals("Could not repost right now. Please try again later.", second.getRepostFailureMessage());

        reset(credits);
        Order repost = reposts.manual("success", second.getId(), "owner", second.getVersion(),
                "updated", 2, 15, Instant.now().plusSeconds(3600), null);
        assertNotEquals(second.getId(), repost.getId());
        Order linked = orders.findById(second.getId()).orElseThrow();
        assertEquals(repost.getId(), linked.getRepostedOrderId());
        assertNull(linked.getRepostFailureMessage());
        assertEquals(count + 1, orders.count());
    }

    @Test
    void wrongRequesterCannotOverwriteFailureOrReserveCredits() {
        Order original = expired(null);
        assertThrows(OrderProblem.class, () -> reposts.manual("intruder", original.getId(), "intruder", original.getVersion(),
                "item", 1, 15, Instant.now().plusSeconds(3600), null));
        assertNull(orders.findById(original.getId()).orElseThrow().getRepostFailureMessage());
        verifyNoInteractions(credits);
    }

    @Test
    void automaticFailurePersistsAndLateSuccessUsesExactSavedExpiry() {
        Instant now = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        Instant expiry = now.plusSeconds(2700);
        RepostPlan plan = new RepostPlan(true, now.minusSeconds(60), 2, 15, expiry);
        Order original = expired(plan);
        doThrow(new OrderProblem("INSUFFICIENT_CREDITS", "private diagnostic"))
                .when(credits).reserve(anyString(), anyString(), anyLong(), any());
        assertThrows(OrderProblem.class, () -> reposts.automatic("auto-fail", original.getId(), now, null));
        Order failed = orders.findById(original.getId()).orElseThrow();
        assertEquals("INSUFFICIENT_CREDITS", failed.getRepostFailureCode());
        assertEquals(OrderStatus.EXPIRED, failed.getStatus());
        assertNull(failed.getRepostedOrderId());
        assertFalse(failed.getRepostPlan().isUsed());
        reset(credits);
        Order repost = reposts.automatic("auto-success", original.getId(), now.plusSeconds(60), null);
        assertEquals(expiry, repost.getExpiresAt());
        assertNotEquals(original.getId(), repost.getId());
        Order linked = orders.findById(original.getId()).orElseThrow();
        assertTrue(linked.getRepostPlan().isUsed());
        assertNull(linked.getRepostFailureMessage());
        assertEquals(expiry, Mappers.getMapper(OrderMapper.class).toResponse(linked).getRepostExpiresAt());
    }

    @Test
    void savedShortAutomaticPlanIsGrandfatheredAfterDatabaseReload() {
        Instant now = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        Instant due = now.minusSeconds(60);
        Order original = expired(new RepostPlan(true, due, 2, 15, due.plusSeconds(3600)));
        Instant legacyExpiry = due.plusSeconds(900);
        // Simulate a previously valid saved plan, not new application input.
        jdbc.update("UPDATE orders SET repost_expires_at = ? WHERE id = ?", java.sql.Timestamp.from(legacyExpiry), original.getId());
        Order loaded = orders.findById(original.getId()).orElseThrow();
        assertEquals(legacyExpiry, loaded.getRepostPlan().getExpiresAt());
        Order repost = reposts.automatic("legacy-short", original.getId(), now, null);
        assertEquals(legacyExpiry, repost.getExpiresAt());
        assertNotEquals(original.getId(), repost.getId());
        verify(credits).reserve(eq(repost.getId()), eq("owner"), eq(2L), any());
    }

    @Test
    void elapsedAutomaticExpiryCannotReserveOrCreateAnOrder() {
        Instant now = Instant.now();
        Order original = expired(new RepostPlan(true, now.minusSeconds(1801), 2, 15, now.minusSeconds(1)));
        long count = orders.count();
        assertThrows(OrderProblem.class, () -> reposts.automatic("elapsed", original.getId(), now, null));
        assertEquals(count, orders.count());
        assertNull(orders.findById(original.getId()).orElseThrow().getRepostedOrderId());
        verifyNoInteractions(credits);
    }
}
