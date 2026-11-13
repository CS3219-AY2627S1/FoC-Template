package sg.edu.nus.foc.order.infrastructure;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

import java.time.Instant;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import sg.edu.nus.foc.order.application.LifecycleProcessingService;
import sg.edu.nus.foc.order.application.OrderCompletionHoldService;
import sg.edu.nus.foc.order.application.OrderTransitionService;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderCheckpoint;
import sg.edu.nus.foc.order.domain.OrderCompletionHold;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.messagingpublisher.interfaces.IOpenOrderRefundTaskPublisher;
import sg.edu.nus.foc.order.messagingpublisher.interfaces.IOrderCompletionTaskPublisher;
import sg.edu.nus.foc.order.application.reportcreation.ReportCreationLifecycle;
import sg.edu.nus.foc.order.application.reportcreation.ReportCreationMessages;

@SpringBootTest(properties = {
        "spring.profiles.active=local", "order.lifecycle.cron=-", "order.messaging.outbox.recovery-cron=-"
})
@Testcontainers
class OrderCompletionHoldJpaIntegrationTest {

    private static final Instant NOW = Instant.parse("2026-10-14T12:00:00Z");

    @Container
    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("completion_hold_test").withUsername("order_test").withPassword("order_test_password");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        properties.add("spring.datasource.username", POSTGRES::getUsername);
        properties.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired private JpaOrderRepository orders;
    @Autowired private JpaOrderCompletionHoldRepository holds;
    @Autowired private JpaOrderCheckpointRepository checkpoints;
    @Autowired private JpaOrderEventOutboxRepository outbox;
    @Autowired private JpaCommandReceiptRepository receipts;
    @Autowired private OrderCompletionHoldService holdService;
    @Autowired private OrderTransitionService transitions;
    @Autowired private LifecycleProcessingService lifecycle;
    @Autowired private PlatformTransactionManager transactions;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ReportCreationLifecycle reportCreations;

    @MockitoSpyBean private OrderCompletionHoldPersistenceAdapter holdAdapter;
    @MockitoSpyBean private OrderEventOutboxPersistenceAdapter penaltyOutboxAdapter;
    @MockitoBean private sg.edu.nus.foc.order.messagingpublisher.interfaces.IPenaltyScoreAdditionPublisher additionPublisher;
    @MockitoBean private sg.edu.nus.foc.order.messagingpublisher.interfaces.IPenaltyScoreDeductionPublisher deductionPublisher;
    @MockitoBean private IOrderCompletionTaskPublisher completionPublisher;
    @MockitoBean private IOpenOrderRefundTaskPublisher refundPublisher;

    @Autowired private JpaPenaltyOutcomeRepository penaltyOutcomes;

    @BeforeEach
    void clearIsolatedDatabase() {
        jdbc.update("delete from order_report_creation_compensations");
        jdbc.update("delete from order_report_creation_lifecycles");
        outbox.deleteAll();
        receipts.deleteAll();
        holds.deleteAll();
        checkpoints.deleteAll();
        penaltyOutcomes.deleteAll();
        orders.deleteAll();
    }

    @Test
    void creationCompensationBeforePlacementPersistsTombstoneAndBlocksLateHold() {
        Order order = delivered();
        String submission = UUID.randomUUID().toString();
        String report = "creation-before-placement";
        var request = creationCompensation(submission, report, order.getId(), "owner");

        assertEquals("NOT_FOUND", reportCreations.compensate(request).outcome());
        assertThrows(OrderProblem.class, () -> holdService.placeActive(order.getId(), report, submission,
                "owner", false, null, "REQUESTER"));
        assertFalse(holds.existsById(report));
        assertFalse(orders.findById(order.getId()).orElseThrow().isCompletionHold());
    }

    @Test
    void placementThenCompensationReleasesExactlyOnceAndDuplicateReplaysResult() {
        Order order = delivered();
        String submission = UUID.randomUUID().toString();
        String report = "creation-after-placement";
        holdService.placeActive(order.getId(), report, submission, "owner", false, null, "REQUESTER");
        var request = creationCompensation(submission, report, order.getId(), "owner");

        var first = reportCreations.compensate(request);
        assertEquals("RELEASED", first.outcome());
        assertEquals(first, reportCreations.compensate(request));
        assertFalse(orders.findById(order.getId()).orElseThrow().isCompletionHold());
        assertThrows(OrderProblem.class, () -> holdService.placeActive(order.getId(), report, submission,
                "owner", false, null, "REQUESTER"));
    }

    @Test
    void bindingMismatchNeverReleasesExistingCreationHold() {
        Order order = delivered();
        String submission = UUID.randomUUID().toString();
        String report = "creation-binding";
        holdService.placeActive(order.getId(), report, submission, "owner", false, null, "REQUESTER");
        var wrong = creationCompensation(UUID.randomUUID().toString(), report, order.getId(), "owner");

        assertEquals("BINDING_MISMATCH", reportCreations.compensate(wrong).outcome());
        assertTrue(orders.findById(order.getId()).orElseThrow().isCompletionHold());
        assertFalse(holds.findById(report).orElseThrow().getReleasedAt() != null);
    }

    private static ReportCreationMessages.Compensation creationCompensation(
            String submission, String report, String order, String reporter) {
        String event = UUID.nameUUIDFromBytes(("ReportCreationCompensationRequested:" + submission)
                .getBytes(StandardCharsets.UTF_8)).toString();
        return new ReportCreationMessages.Compensation(event, submission, report, order, reporter, 2);
    }

    @Test
    void sqlSelectionSkipsHeldOrdersAndTheUnheldOrderCompletes() {
        Order held = delivered();
        Order successful = delivered();
        long displayedVersion = held.getVersion();
        holdService.place(held.getId(), "held-report", "owner", null);

        OrderProblem rejected = assertThrows(OrderProblem.class, () -> transitions.complete(
                "stale-held-completion", held.getId(), "owner", displayedVersion, null));
        assertEquals("COMPLETION_ON_HOLD", rejected.getCode());

        assertEquals(List.of(successful.getId()), orders.findDueForAutoCompletionIds(
                OrderStatus.DELIVERED, NOW.minus(Order.AUTOMATIC_COMPLETION_DELAY)));
        assertEquals(1, lifecycle.autoCompleteDue(NOW));
        assertEquals(OrderStatus.DELIVERED, orders.findById(held.getId()).orElseThrow().getStatus());
        assertEquals(OrderStatus.COMPLETED, orders.findById(successful.getId()).orElseThrow().getStatus());
        assertEquals(2, outbox.count());
    }

    @Test
    void placementIsIdempotentAndReportIdsCannotBeMovedToAnotherOrder() {
        Order order = delivered();
        Order first = holdService.place(order.getId(), "report-a", "owner", null);
        long version = first.getVersion();
        holdService.place(order.getId(), "report-a", "owner", null);
        holdService.place(order.getId(), "report-b", "owner", null);

        assertEquals(2, holds.count());
        assertTrue(orders.findById(order.getId()).orElseThrow().isCompletionHold());
        assertEquals(version, orders.findById(order.getId()).orElseThrow().getVersion());
        Order another = delivered();
        assertThrows(OrderProblem.class, () -> holdService.place(another.getId(), "report-a", "owner", null));
        assertFalse(orders.findById(another.getId()).orElseThrow().isCompletionHold());
        assertEquals(0, outbox.count());
    }

    @Test
    void aFailedPlacementRollsBackBothRecordAndFlag() {
        Order order = delivered();
        doAnswer(invocation -> {
            invocation.callRealMethod();
            holds.flush();
            throw new IllegalStateException("failure after database write");
        }).when(holdAdapter).save(any(OrderCompletionHold.class));

        RuntimeException failure = assertThrows(RuntimeException.class,
                () -> holdService.place(order.getId(), "failed-report", "owner", null));
        assertEquals("failure after database write", failure.getMessage());
        assertFalse(orders.findById(order.getId()).orElseThrow().isCompletionHold());
        assertFalse(holds.existsById("failed-report"));
    }

    @Test
    void heldOpenOrderIsNotExpiredAndManualFundingOutcomeIsRejected() {
        Order order = orders.saveAndFlush(open());
        holdService.place(order.getId(), "open-report", "owner", null);
        long version = orders.findById(order.getId()).orElseThrow().getVersion();

        assertEquals(0, lifecycle.expireDue(NOW));
        assertThrows(OrderProblem.class, () -> transitions.cancel("cancel-held", order.getId(), "owner", version, null));
        assertEquals(OrderStatus.OPEN, orders.findById(order.getId()).orElseThrow().getStatus());
        assertEquals(0, outbox.count());
    }

    @Test
    void holdAndCompletionSerializeOnTheSameOrderRow() throws Exception {
        Order order = delivered();
        CountDownLatch placed = new CountDownLatch(1);
        CountDownLatch commit = new CountDownLatch(1);
        ExecutorService worker = Executors.newSingleThreadExecutor();
        try {
            Future<?> placement = worker.submit(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> {
                holdService.place(order.getId(), "race-report", "owner", null);
                holds.flush();
                placed.countDown();
                try {
                    if (!commit.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Timed out waiting to commit hold");
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(interrupted);
                }
            }));
            assertTrue(placed.await(10, TimeUnit.SECONDS));
            assertThrows(RuntimeException.class, () -> transitions.autoComplete(order.getId(), NOW));
            commit.countDown();
            placement.get(10, TimeUnit.SECONDS);
            assertFalse(transitions.autoComplete(order.getId(), NOW));
            assertEquals(OrderStatus.DELIVERED, orders.findById(order.getId()).orElseThrow().getStatus());
            assertEquals(0, outbox.count());
        } finally {
            commit.countDown();
            worker.shutdownNow();
        }
    }

    @Test
    void concurrentSameReportCannotMoveItsOrderBinding() throws Exception {
        Order firstOrder = delivered();
        Order secondOrder = delivered();
        CountDownLatch bothRead = new CountDownLatch(2);
        CountDownLatch firstCommitted = new CountDownLatch(1);
        doAnswer(invocation -> {
            Object result = invocation.callRealMethod();
            bothRead.countDown();
            if (!bothRead.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Both placements did not read");
            return result;
        }).when(holdAdapter).findByReportId("shared-report");
        doAnswer(invocation -> {
            OrderCompletionHold hold = invocation.getArgument(0);
            if (hold.getOrderId().equals(secondOrder.getId()) && !firstCommitted.await(10, TimeUnit.SECONDS)) {
                throw new IllegalStateException("First placement did not commit");
            }
            return invocation.callRealMethod();
        }).when(holdAdapter).save(any(OrderCompletionHold.class));
        ExecutorService workers = Executors.newFixedThreadPool(2);
        try {
            Future<Order> first = workers.submit(() -> {
                try {
                    return holdService.place(firstOrder.getId(), "shared-report", "owner", null);
                } finally {
                    firstCommitted.countDown();
                }
            });
            Future<Order> second = workers.submit(() -> holdService.place(secondOrder.getId(), "shared-report", "owner", null));
            assertTrue(first.get(20, TimeUnit.SECONDS).isCompletionHold());
            assertThrows(ExecutionException.class, () -> second.get(20, TimeUnit.SECONDS));
            assertEquals(firstOrder.getId(), holds.findById("shared-report").orElseThrow().getOrderId());
            assertFalse(orders.findById(secondOrder.getId()).orElseThrow().isCompletionHold());
            assertEquals(1, holds.count());
        } finally {
            firstCommitted.countDown();
            workers.shutdownNow();
        }
    }

    @Test
    void penaltyPersistenceFailureRollsBackCompletionCreditEventAndReceiptTogether() {
        Order order = delivered();
        long version = orders.findById(order.getId()).orElseThrow().getVersion();
        doAnswer(invocation -> {
            invocation.callRealMethod();
            throw new IllegalStateException("injected penalty persistence failure");
        }).when(penaltyOutboxAdapter).enqueue(org.mockito.ArgumentMatchers.isA(
                sg.edu.nus.foc.order.messagingpublisher.dto.PenaltyScoreDeductionEvent.class));

        assertThrows(RuntimeException.class,
                () -> transitions.complete("penalty-rollback", order.getId(), "owner", version, null));
        assertEquals(OrderStatus.DELIVERED, orders.findById(order.getId()).orElseThrow().getStatus());
        assertEquals(0, outbox.count());
        assertEquals(0, receipts.count());
        assertFalse(checkpoints.findByOrderIdOrderByOccurredAtAsc(order.getId()).stream()
                .anyMatch(checkpoint -> checkpoint.getStatus() == OrderStatus.COMPLETED));
    }

    @Test
    void releaseIsReportSpecificAuditedAndIdempotent() {
        Order order = delivered();
        holdService.place(order.getId(), "first-report", "owner", null);
        holdService.place(order.getId(), "second-report", "owner", null);
        assertTrue(holdService.release(order.getId(), "first-report", "admin").isCompletionHold());
        Instant released = holds.findById("first-report").orElseThrow().getReleasedAt();
        holdService.release(order.getId(), "first-report", "another-admin");
        assertEquals(released, holds.findById("first-report").orElseThrow().getReleasedAt());
        assertEquals("admin", holds.findById("first-report").orElseThrow().getReleasedBy());
        assertFalse(holdService.release(order.getId(), "second-report", "admin").isCompletionHold());
        assertEquals(2, holds.count());
        assertEquals(0, outbox.count());
    }

    @Test
    void failedReleaseRollsBackAuditAndFlagAndCannotMoveAnotherOrdersHold() {
        Order order = delivered();
        holdService.place(order.getId(), "release-report", "owner", null);
        Order other = delivered();
        assertThrows(OrderProblem.class, () -> holdService.release(other.getId(), "release-report", "admin"));
        doAnswer(invocation -> {
            invocation.callRealMethod();
            throw new IllegalStateException("after hold release flush");
        }).when(holdAdapter).release(any(OrderCompletionHold.class));
        assertThrows(RuntimeException.class, () -> holdService.release(order.getId(), "release-report", "admin"));
        assertTrue(orders.findById(order.getId()).orElseThrow().isCompletionHold());
        org.junit.jupiter.api.Assertions.assertNull(holds.findById("release-report").orElseThrow().getReleasedAt());
    }

    @Test
    void waiverPersistsButCompletionPublishesOnlyFundingWithoutRewardOrPenalty() {
        Order order = open();
        Instant deliveredAt = NOW.minusSeconds(49 * 3600L);
        order.accept("courier", 0, NOW.minusSeconds(3 * 86400L).plusSeconds(60));
        order.start("courier", 0, deliveredAt.minusSeconds(3600));
        order.markPickedUp("courier", 0);
        order.markDelivered("courier", 0, deliveredAt);
        orders.saveAndFlush(order);
        // Reproduce a previously persisted V12 waiver; no new waiver HTTP/service exists.
        order.waiveOverdue("admin", "Valid exceptional delay", NOW);
        orders.saveAndFlush(order);
        Order reviewed = orders.findById(order.getId()).orElseThrow();
        assertTrue(reviewed.getOverdue());
        assertTrue(reviewed.isOverduePenaltyWaived());
        transitions.complete("waived-completion", order.getId(), "owner", reviewed.getVersion(), null);
        assertEquals(OrderStatus.COMPLETED, orders.findById(order.getId()).orElseThrow().getStatus());
        assertEquals(1, outbox.count());
        org.mockito.Mockito.verifyNoInteractions(additionPublisher, deductionPublisher);
    }

    @Test
    void completedOrdersRejectNewReportsEvenForOwner() {
        Order order = delivered();
        order.confirmCompletion("owner", order.getVersion());
        order = orders.saveAndFlush(order);
        String orderId = order.getId();
        assertThrows(OrderProblem.class, () -> holdService.place(orderId, "completed-report", "owner", null));
        assertFalse(holds.existsById("completed-report"));
        assertFalse(orders.findById(order.getId()).orElseThrow().isCompletionHold());
    }

    @Autowired private sg.edu.nus.foc.order.application.OrderQueryService activeQueries;

    @Test void unifiedParticipantSelectionAndHoldUseActualOwnershipBeforePaging() {
        Order own = open();
        own.accept("other", 0, own.getCreatedAt().plusSeconds(60));
        orders.saveAndFlush(own);
        Order assigned = Order.open("different-owner", "other", "p", "d", 1, 30, NOW, NOW.plusSeconds(7200));
        assigned.accept("owner", 0, NOW.plusSeconds(60));
        orders.saveAndFlush(assigned);
        orders.saveAndFlush(open());
        assertEquals(2, activeQueries.participantActive("owner", 1, 1).getTotalItems());
        assertEquals(1, activeQueries.participantActive("owner", 2, 1).getItems().size());
        assertEquals(0, activeQueries.participantActive("stranger", 1, 20).getTotalItems());
        assertThrows(OrderProblem.class, () -> activeQueries.participantActive("owner", 0, 20));
        assertThrows(OrderProblem.class, () -> activeQueries.participantActive("owner", 1, 0));
        assertThrows(OrderProblem.class, () -> activeQueries.participantActive("owner", 1, 101));
        assertThrows(OrderProblem.class, () -> holdService.placeActive(assigned.getId(), "foreign", "stranger", true, null, "PARTICIPANT"));
        assertTrue(holdService.placeActive(assigned.getId(), "assigned", "owner", true, null, "PARTICIPANT").isCompletionHold());
        assertEquals("different-owner", holds.findById("assigned").orElseThrow().getRequesterId());
        assertTrue(holdService.placeActive(own.getId(), "owned", "owner", true, null, "PARTICIPANT").isCompletionHold());
    }

    @Test void courierReportingListFiltersCurrentAssignmentAndStatusBeforePaging() {
        for (OrderStatus status : OrderStatus.values()) {
            Order candidate = open();
            org.springframework.test.util.ReflectionTestUtils.setField(candidate, "status", status);
            org.springframework.test.util.ReflectionTestUtils.setField(candidate, "courierId", "courier");
            orders.saveAndFlush(candidate);
        }
        Order other = open();
        other.accept("different-courier", 0, other.getCreatedAt().plusSeconds(60));
        orders.saveAndFlush(other);
        sg.edu.nus.foc.order.domain.repository.OrderPage first = activeQueries.assignedActiveTo("courier", 1, 2);
        sg.edu.nus.foc.order.domain.repository.OrderPage second = activeQueries.assignedActiveTo("courier", 2, 2);
        assertEquals(4, first.getTotalItems());
        assertEquals(2, first.getTotalPages());
        assertEquals(2, first.getItems().size());
        assertEquals(2, second.getItems().size());
        assertEquals(0, activeQueries.assignedActiveTo("stranger", 1, 20).getTotalItems());
        assertThrows(OrderProblem.class, () -> activeQueries.assignedActiveTo("courier", 0, 20));
        assertThrows(OrderProblem.class, () -> activeQueries.assignedActiveTo("courier", 1, 101));
    }

    @Test void courierReportHoldKeepsActualOwnerBindingAndBlocksStrangersAndDuplicates() {
        Order candidate = open();
        candidate.accept("courier", 0, candidate.getCreatedAt().plusSeconds(60));
        String id = orders.saveAndFlush(candidate).getId();
        assertEquals("NOT_FOUND", assertThrows(OrderProblem.class,
                () -> holdService.placeActive(id, "foreign", "stranger", true, null, "COURIER")).getCode());
        Order held = holdService.placeActive(id, "errand-report", "courier", true, null, "COURIER");
        assertTrue(held.isCompletionHold());
        assertEquals("owner", holds.findById("errand-report").orElseThrow().getRequesterId());
        assertTrue(holdService.placeActive(id, "errand-report", "courier", true, null, "COURIER").isCompletionHold());
        assertEquals(1, holds.count());
        assertThrows(OrderProblem.class, () -> holdService.placeActive(id, "second", "owner", true, null));
        holdService.release(id, "errand-report", "admin");
        assertFalse(orders.findById(id).orElseThrow().isCompletionHold());
        assertThrows(OrderProblem.class, () -> holdService.placeActive(id, "errand-report", "courier", true, null, "COURIER"));
    }

    @Test
    void reportingActiveListFiltersOwnerAndTerminalBeforePagination() {
        for (OrderStatus status : OrderStatus.values()) {
            Order candidate = open();
            org.springframework.test.util.ReflectionTestUtils.setField(candidate, "status", status);
            orders.saveAndFlush(candidate);
        }
        Order other = Order.open("different-owner", "Other", "p", "d", 1, 30, NOW, NOW.plusSeconds(7200));
        orders.saveAndFlush(other);
        var first = activeQueries.requestedActiveBy("owner", 1, 2);
        var second = activeQueries.requestedActiveBy("owner", 2, 2);
        var third = activeQueries.requestedActiveBy("owner", 3, 2);
        assertEquals(4, first.getTotalItems());
        assertEquals(2, first.getTotalPages());
        assertEquals(2, first.getItems().size());
        assertEquals(0, third.getItems().size());
        var ids = new java.util.HashSet<String>();
        for (var page : java.util.List.of(first, second, third)) for (Order o : page.getItems()) {
            assertEquals("owner", o.getRequesterId());
            assertTrue(java.util.Set.of(OrderStatus.ACCEPTED, OrderStatus.IN_PROGRESS,
                    OrderStatus.PICKED_UP, OrderStatus.DELIVERED).contains(o.getStatus()));
            assertTrue(ids.add(o.getId()));
        }
        assertEquals(first.getItems().stream().map(Order::getId).toList(),
                activeQueries.requestedActiveBy("owner", 1, 2).getItems().stream().map(Order::getId).toList());
        assertThrows(OrderProblem.class, () -> activeQueries.requestedActiveBy("owner", 0, 20));
        assertThrows(OrderProblem.class, () -> activeQueries.requestedActiveBy("owner", 1, 101));
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(OrderStatus.class)
    void reportingHoldScopesAndValidatesEveryState(OrderStatus status) {
        Order candidate = open();
        org.springframework.test.util.ReflectionTestUtils.setField(candidate, "status", status);
        candidate = orders.saveAndFlush(candidate);
        String id = candidate.getId();
        boolean active = java.util.Set.of(OrderStatus.ACCEPTED, OrderStatus.IN_PROGRESS,
                OrderStatus.PICKED_UP, OrderStatus.DELIVERED).contains(status);
        if (active) {
            assertTrue(holdService.placeActive(id, "active-report", "owner", false, null).isCompletionHold());
            assertTrue(holds.existsById("active-report"));
        } else {
            assertEquals("NOT_FOUND", assertThrows(OrderProblem.class,
                    () -> holdService.placeActive(id, "active-report", "owner", false, null)).getCode());
            assertFalse(holds.existsById("active-report"));
        }
    }

    @Test
    void reportingHoldChecksCourierBindingOwnershipAndReusesCurrentSnapshot() {
        Order candidate = orders.saveAndFlush(open());
        String id = candidate.getId();
        assertEquals("NOT_FOUND", assertThrows(OrderProblem.class,
                () -> holdService.placeActive(id, "report", "stranger", false, null)).getCode());
        assertEquals("NOT_FOUND", assertThrows(OrderProblem.class,
                () -> holdService.placeActive("missing", "report", "owner", false, null)).getCode());
        assertEquals("NOT_FOUND", assertThrows(OrderProblem.class,
                () -> holdService.placeActive(id, "report", "owner", true, null)).getCode());
        assertFalse(holds.existsById("report"));
        candidate.accept("courier", candidate.getVersion(), candidate.getCreatedAt().plusSeconds(60));
        orders.saveAndFlush(candidate);
        holdService.placeActive(id, "report", "owner", false, null);
        Order progressing = orders.findById(id).orElseThrow();
        progressing.start("courier", progressing.getVersion(), progressing.getCreatedAt().plusSeconds(120));
        orders.saveAndFlush(progressing);
        assertEquals(OrderStatus.IN_PROGRESS, holdService.placeActive(id, "report", "owner", true, null).getStatus());
        assertEquals(1, holds.count());
        Order otherCandidate = open();
        otherCandidate.accept("courier", 0, otherCandidate.getCreatedAt().plusSeconds(60));
        Order other = orders.saveAndFlush(otherCandidate);
        assertEquals("CONFLICT", assertThrows(OrderProblem.class,
                () -> holdService.placeActive(other.getId(), "report", "owner", false, null)).getCode());
    }


    @Test
    void completedCreditContextIsSqlScopedAndReportHoldRejectsADifferentActiveReport() {
        Order completed = delivered();
        completed.confirmCompletion("owner", completed.getVersion());
        completed = orders.saveAndFlush(completed);
        Order active = delivered();
        Order cancelled = open();
        cancelled.cancelOpen("owner", 0);
        cancelled = orders.saveAndFlush(cancelled);
        assertEquals(1, orders.findCreditHistoryInvolving("owner", OrderStatus.CANCELLED, org.springframework.data.domain.PageRequest.of(0, 20)).getTotalElements());
        assertEquals(0, orders.findCreditHistoryInvolving("outsider", OrderStatus.CANCELLED, org.springframework.data.domain.PageRequest.of(0, 20)).getTotalElements());
        assertTrue(orders.findCreditHistoryInvolving(cancelled.getId(), "owner", OrderStatus.CANCELLED).isPresent());
        assertTrue(orders.findCreditHistoryInvolving(completed.getId(), "owner", OrderStatus.CANCELLED).isEmpty());
        assertEquals(1, orders.findCreditHistoryInvolving("owner", OrderStatus.COMPLETED, org.springframework.data.domain.PageRequest.of(0, 20)).getTotalElements());
        assertEquals(1, orders.findCreditHistoryInvolving("courier", OrderStatus.COMPLETED, org.springframework.data.domain.PageRequest.of(0, 20)).getTotalElements());
        assertEquals(0, orders.findCreditHistoryInvolving("outsider", OrderStatus.COMPLETED, org.springframework.data.domain.PageRequest.of(0, 20)).getTotalElements());
        assertTrue(orders.findCreditHistoryInvolving(completed.getId(), "outsider", OrderStatus.COMPLETED).isEmpty());
        assertTrue(orders.findCreditHistoryInvolving(active.getId(), "owner", OrderStatus.COMPLETED).isEmpty());
        assertTrue(orders.findCreditHistoryInvolving(completed.getId(), "courier", OrderStatus.COMPLETED).isPresent());
        holdService.placeActive(active.getId(), "first", "owner", true, null);
        holdService.placeActive(active.getId(), "first", "owner", true, null);
        OrderProblem duplicate = assertThrows(OrderProblem.class,
                () -> holdService.placeActive(active.getId(), "second", "owner", true, null));
        assertTrue(duplicate.getMessage().contains("This order has an active report. Please resolve it before proceeding."));
        assertEquals(1, holds.count());
    }

    private Order delivered() {
        Order order = open();
        Instant start = NOW.minusSeconds(3 * 86400L);
        order.accept("courier", 0, start.plusSeconds(60));
        Instant deliveredAt = NOW.minusSeconds(49 * 3600L);
        order.start("courier", 0, deliveredAt.minusSeconds(600));
        order.markPickedUp("courier", 0);
        order.markDelivered("courier", 0, deliveredAt);
        Order saved = orders.saveAndFlush(order);
        checkpoints.saveAndFlush(new OrderCheckpoint(saved.getId(), OrderStatus.ACCEPTED,
                start.plusSeconds(60), "courier", null));
        checkpoints.saveAndFlush(new OrderCheckpoint(saved.getId(), OrderStatus.DELIVERED,
                NOW.minusSeconds(49 * 3600L), "courier", null));
        return saved;
    }

    private static Order open() {
        Instant start = NOW.minusSeconds(3 * 86400L);
        return Order.open("owner", "books", "pickup", "delivery", 5, 30, start, start.plusSeconds(3600));
    }
}
