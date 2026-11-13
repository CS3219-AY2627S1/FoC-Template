package com.friendoncampus.order.messaging;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import com.friendoncampus.order.repository.OutboxEventRepository;

/**
 * {@link OutboxEventRepository#claimUnpublished} against a real PostgreSQL: while one relay
 * instance holds an order's stream, another instance claims none of that stream's events, so the
 * order's later events cannot overtake an earlier one; and the backlog query behind the outbox
 * gauges. Requires Docker.
 */
@SpringBootTest(properties = {"app.orders.expiry.enabled=false", "app.kafka.enabled=false"})
@Testcontainers
class OutboxStreamClaimIntegrationTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    private static final OffsetDateTime T0 = OffsetDateTime.of(2026, 11, 9, 8, 0, 0, 0, ZoneOffset.UTC);

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @Autowired
    private OutboxEventRepository repository;

    @Autowired
    private TransactionTemplate transactions;

    @Autowired
    private JdbcTemplate jdbc;

    @BeforeEach
    void clean() {
        jdbc.update("delete from outbox_events");
    }

    private OutboxEvent save(UUID orderId, String topic, int minute) {
        return repository.save(new OutboxEvent(UUID.randomUUID(), orderId, minute, "OrderTransitioned", topic, null,
                "{\"minute\":" + minute + "}", T0.plusMinutes(minute)));
    }

    private static List<UUID> ids(List<OutboxEvent> events) {
        return events.stream().map(OutboxEvent::getId).toList();
    }

    @Test
    void oneRunClaimsAWholeStreamInOrder() {
        UUID orderId = UUID.randomUUID();
        OutboxEvent first = save(orderId, "order.lifecycle.events", 0);
        OutboxEvent second = save(orderId, "order.lifecycle.events", 1);
        OutboxEvent third = save(orderId, "order.lifecycle.events", 2);

        List<OutboxEvent> claimed = transactions.execute(status -> repository.claimUnpublished(20));

        assertThat(ids(claimed)).containsExactly(first.getId(), second.getId(), third.getId());
    }

    @Test
    void theLimitCapsTheRowsAndKeepsTheOldestFirst() {
        UUID orderId = UUID.randomUUID();
        OutboxEvent first = save(orderId, "order.events", 0);
        OutboxEvent second = save(orderId, "order.events", 1);
        save(orderId, "order.events", 2);

        List<OutboxEvent> claimed = transactions.execute(status -> repository.claimUnpublished(2));

        assertThat(ids(claimed)).containsExactly(first.getId(), second.getId());
    }

    @Test
    void aPublishedRowNoLongerBlocksTheRowsBehindIt() {
        UUID orderId = UUID.randomUUID();
        OutboxEvent first = save(orderId, "order.events", 0);
        OutboxEvent second = save(orderId, "order.events", 1);
        jdbc.update("update outbox_events set published_at = now() where id = ?", first.getId());

        List<OutboxEvent> claimed = transactions.execute(status -> repository.claimUnpublished(20));

        assertThat(ids(claimed)).containsExactly(second.getId());
    }

    @Test
    void aSecondInstanceSkipsAStreamTheFirstHoldsButTakesOtherStreams() throws Exception {
        UUID held = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        OutboxEvent heldFirst = save(held, "order.events", 0);
        OutboxEvent heldSecond = save(held, "order.events", 1);
        // Same order, other topic: a separate stream, free to go.
        OutboxEvent heldLifecycle = save(held, "order.lifecycle.events", 2);
        OutboxEvent otherFirst = save(other, "order.events", 3);

        CountDownLatch firstClaimed = new CountDownLatch(1);
        CountDownLatch secondDone = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        // Instance A claims only the held order's oldest row and keeps its transaction open.
        Future<List<UUID>> instanceA = pool.submit(() -> transactions.execute(status -> {
            List<UUID> claimed = ids(repository.claimUnpublished(1));
            firstClaimed.countDown();
            try {
                secondDone.await(30, TimeUnit.SECONDS);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            }
            return claimed;
        }));
        assertThat(firstClaimed.await(30, TimeUnit.SECONDS)).isTrue();
        Future<List<UUID>> instanceB = pool.submit(() -> transactions.execute(status ->
                ids(repository.claimUnpublished(20))));
        List<UUID> claimedByB = instanceB.get(30, TimeUnit.SECONDS);
        secondDone.countDown();
        List<UUID> claimedByA = instanceA.get(30, TimeUnit.SECONDS);
        pool.shutdown();

        assertThat(claimedByA).containsExactly(heldFirst.getId());
        // B never sees the held stream's later row while A is sending its earlier one.
        assertThat(claimedByB).doesNotContain(heldFirst.getId(), heldSecond.getId())
                .containsExactly(heldLifecycle.getId(), otherFirst.getId());
    }

    @Test
    void theBacklogReportsPendingRowsTheirOldestAgeAndWorstAttempts() {
        UUID orderId = UUID.randomUUID();
        save(orderId, "order.events", 0);
        save(orderId, "order.events", 1);
        OutboxEvent published = save(UUID.randomUUID(), "order.events", 2);
        jdbc.update("update outbox_events set published_at = now() where id = ?", published.getId());
        jdbc.update("update outbox_events set attempts = 4 where aggregate_id = ? and aggregate_version = 1", orderId);

        OutboxEventRepository.OutboxBacklog backlog = repository.backlog(T0.plusMinutes(10));

        assertThat(backlog.getPending()).isEqualTo(2);
        assertThat(backlog.getOldestAgeSeconds()).isEqualTo(600.0);
        assertThat(backlog.getMaxAttempts()).isEqualTo(4);
    }

    @Test
    void anEmptyBacklogIsAllZero() {
        OutboxEventRepository.OutboxBacklog backlog = repository.backlog(T0);

        assertThat(backlog.getPending()).isZero();
        assertThat(backlog.getOldestAgeSeconds()).isZero();
        assertThat(backlog.getMaxAttempts()).isZero();
    }
}
