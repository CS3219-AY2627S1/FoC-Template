package com.cs3219.foc.order.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.cs3219.foc.order.exception.OrderConflictException;
import com.cs3219.foc.order.infrastructure.client.*;
import com.cs3219.foc.order.integration.AbstractIntegrationTest;
import com.cs3219.foc.order.model.dto.*;
import com.cs3219.foc.order.model.dto.event.*;
import com.cs3219.foc.order.model.entity.DisputeDecision;
import com.cs3219.foc.order.model.entity.DisputeStatus;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.concurrent.*;
import java.util.stream.Collectors;
import javax.sql.DataSource;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@Import(OrderLifecyclePersistenceTests.TestConfig.class)
class OrderDisputePersistenceTests extends AbstractIntegrationTest {
    @Autowired
    private OrderService orders;

    @Autowired
    private OrderDisputeService disputes;

    @Autowired
    private DeliveryService delivery;

    @Autowired
    private CreditClient credit;

    @Autowired
    private SupplierClient suppliers;

    @Autowired
    private UserClient users;

    @Autowired
    private DataSource dataSource;

    @Autowired
    private OrderLifecyclePersistenceTests.Facts facts;

    private UUID requester;
    private UUID courier;
    private UUID admin;

    @BeforeEach
    void prepare() {
        new JdbcTemplate(dataSource)
                .execute(
                        "TRUNCATE order_disputes, errands, delivery_photos, errand_messages, errand_chat_reads, event_publication");
        facts.events.clear();
        reset(credit, suppliers, users);
        when(credit.reserve(any())).thenReturn(new CreditReservationResponse("RESERVED"));
        when(suppliers.get(any()))
                .thenAnswer(call -> new SupplierPickupDto(call.getArgument(0), "Cafe", "COM1", "01", "Lobby", true));
        when(users.find(any())).thenAnswer(call -> ((Set<UUID>) call.getArgument(0))
                .stream().collect(Collectors.toMap(id -> id, id -> new UserBriefDto(id, "User"))));
        requester = UUID.randomUUID();
        courier = UUID.randomUUID();
        admin = UUID.randomUUID();
    }

    @AfterEach
    void clearActor() {
        SecurityContextHolder.clearContext();
    }

    private static void as(UUID id, String role) {
        SecurityContextHolder.getContext()
                .setAuthentication(new UsernamePasswordAuthenticationToken(
                        id.toString(), "n/a", List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }

    private UUID accepted(boolean pickedUp) {
        as(requester, "USER");
        var id = orders.create(
                        new CreateErrandRequest(UUID.randomUUID(), UUID.randomUUID(), "Library", "Lunch", "", 5, 60))
                .errandId();
        as(courier, "USER");
        orders.accept(id);
        if (pickedUp) orders.pickUp(id);
        return id;
    }

    /** The courier hands the item over with a photo. */
    private void deliver(UUID id) {
        as(courier, "USER");
        delivery.deliver(id, List.of(new MockMultipartFile("photos", "handover.jpg", "image/jpeg", new byte[] {9})));
    }

    @Test
    void deliveredOrdersCanBeDisputedAndTheCourierPaid() {
        var id = accepted(true);
        deliver(id);
        // e.g. the photo shows the wrong item
        var dispute = report(id);
        assertThat(dispute.status()).isEqualTo(DisputeStatus.OPEN);
        resolve(dispute, DisputeDecision.PAY_COURIER);
        as(requester, "USER");
        assertThat(orders.get(id).status().name()).isEqualTo("COMPLETED");
    }

    @Test
    void deliveryIsPausedWhileADisputeIsOpen() {
        var id = accepted(true);
        var dispute = report(id);
        assertThatThrownBy(() -> deliver(id)).isInstanceOf(OrderConflictException.class);
        resolve(dispute, DisputeDecision.DISMISS);
        deliver(id);
        as(requester, "USER");
        assertThat(orders.get(id).status().name()).isEqualTo("DELIVERED");
    }

    private OrderDisputeDto report(UUID id) {
        as(requester, "USER");
        return disputes.report(id, new ReportDisputeRequest("Delivery problem"));
    }

    private OrderDisputeDto resolve(OrderDisputeDto dispute, DisputeDecision decision) {
        as(admin, "ADMIN");
        return disputes.resolve(dispute.id(), new ResolveDisputeRequest(decision, "Reviewed the order and complaint"));
    }

    @Test
    void openOrderViewerCannotSeeADisputeReportedDuringTheDetailLookup() {
        as(requester, "USER");
        var id = orders.create(
                        new CreateErrandRequest(UUID.randomUUID(), UUID.randomUUID(), "Library", "Lunch", "", 5, 60))
                .errandId();
        var visitor = UUID.randomUUID();
        var names = Map.of(
                requester, new UserBriefDto(requester, "Requester"), courier, new UserBriefDto(courier, "Courier"));
        doAnswer(call -> {
                    // The order changes while its public detail request is fetching participant names.
                    as(courier, "USER");
                    orders.accept(id);
                    var dispute = report(id);
                    as(courier, "USER");
                    disputes.respond(dispute.id(), new RespondToDisputeRequest("Courier explanation"));
                    as(visitor, "USER");
                    return names;
                })
                .doReturn(names)
                .when(users)
                .find(any());

        as(visitor, "USER");
        var publicDetail = orders.get(id);
        assertThat(publicDetail.status().name()).isEqualTo("OPEN");
        assertThat(publicDetail.dispute()).isNull();
        assertThat(publicDetail.createRequestId()).isNull();
        assertThatThrownBy(() -> orders.get(id)).isInstanceOf(AccessDeniedException.class);

        as(requester, "USER");
        assertThat(orders.get(id).dispute().complaint()).isEqualTo("Delivery problem");
        as(courier, "USER");
        assertThat(orders.get(id).dispute().complaint()).isEqualTo("Delivery problem");
        as(admin, "ADMIN");
        assertThat(orders.get(id).dispute().complaint()).isEqualTo("Delivery problem");
    }

    @Test
    void participantsReportOnceAndDismissalResumesPickup() {
        var id = accepted(false);
        as(UUID.randomUUID(), "USER");
        assertThatThrownBy(() -> disputes.report(id, new ReportDisputeRequest("Not my order")))
                .isInstanceOf(AccessDeniedException.class);
        var dispute = report(id);
        as(courier, "USER");
        assertThat(disputes.report(id, new ReportDisputeRequest("Repeated report"))
                        .id())
                .isEqualTo(dispute.id());
        assertThat(orders.get(id).dispute().complaint()).isEqualTo("Delivery problem");
        assertThatThrownBy(() -> orders.pickUp(id)).isInstanceOf(OrderConflictException.class);
        as(requester, "ADMIN");
        assertThatThrownBy(() ->
                        disputes.resolve(dispute.id(), new ResolveDisputeRequest(DisputeDecision.DISMISS, "Own case")))
                .isInstanceOf(AccessDeniedException.class);
        assertThat(resolve(dispute, DisputeDecision.DISMISS).status()).isEqualTo(DisputeStatus.RESOLVED);
        assertThat(facts.events).isEmpty();
        as(courier, "USER");
        orders.pickUp(id);
        deliver(id);
        as(requester, "USER");
        orders.complete(id);
        assertThat(orders.get(id).status().name()).isEqualTo("COMPLETED");
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void onlyTheOtherParticipantCanRespondAndTheStatementIsPreserved(boolean courierReports) {
        var id = accepted(false);
        var reporterId = courierReports ? courier : requester;
        var responderId = courierReports ? requester : courier;
        as(reporterId, "USER");
        var dispute = disputes.report(id, new ReportDisputeRequest("Original complaint"));
        var request = new RespondToDisputeRequest("  My explanation  ");
        assertThatThrownBy(() -> disputes.respond(dispute.id(), request)).isInstanceOf(AccessDeniedException.class);
        as(UUID.randomUUID(), "USER");
        assertThatThrownBy(() -> disputes.respond(dispute.id(), request)).isInstanceOf(AccessDeniedException.class);
        as(admin, "ADMIN");
        assertThatThrownBy(() -> disputes.respond(dispute.id(), request)).isInstanceOf(AccessDeniedException.class);

        as(responderId, "USER");
        var responded = disputes.respond(dispute.id(), request);
        assertThat(responded.response()).isEqualTo("My explanation");
        assertThat(responded.responderId()).isEqualTo(responderId);
        assertThat(responded.respondedAt()).isNotNull();
        assertThat(responded.complaint()).isEqualTo("Original complaint");
        assertThat(responded.status()).isEqualTo(DisputeStatus.OPEN);
        assertThat(disputes.respond(dispute.id(), request)).isEqualTo(responded);
        assertThatThrownBy(() -> disputes.respond(dispute.id(), new RespondToDisputeRequest("Replacement")))
                .isInstanceOf(OrderConflictException.class);
        assertThat(orders.get(id).creditState().name()).isEqualTo("RESERVED");
        assertThat(facts.events).isEmpty();

        var resolved = resolve(dispute, DisputeDecision.DISMISS);
        assertThat(resolved.response()).isEqualTo("My explanation");
        assertThat(resolved.respondedAt()).isEqualTo(responded.respondedAt());
        assertThat(orders.get(id).dispute().response()).isEqualTo("My explanation");
        as(responderId, "USER");
        assertThat(disputes.respond(dispute.id(), request)).isEqualTo(resolved);
    }

    @ParameterizedTest
    @EnumSource(DisputeDecision.class)
    void newResponsesAreRejectedAfterAnAdminDecision(DisputeDecision decision) {
        var dispute = report(accepted(true));
        resolve(dispute, decision);
        as(courier, "USER");
        assertThatThrownBy(() -> disputes.respond(dispute.id(), new RespondToDisputeRequest("Late explanation")))
                .isInstanceOf(OrderConflictException.class);
        assertThat(disputes.forOrder(dispute.orderId()).response()).isNull();
    }

    @Test
    void competingResponsesRecordOnlyOneStatement() throws Exception {
        var dispute = report(accepted(false));
        var barrier = new CyclicBarrier(2);
        try (var executor = Executors.newFixedThreadPool(2)) {
            List<Future<Boolean>> attempts = new ArrayList<>();
            for (var response : List.of("First explanation", "Second explanation")) {
                attempts.add(executor.submit(() -> {
                    as(courier, "USER");
                    try {
                        barrier.await(10, TimeUnit.SECONDS);
                        disputes.respond(dispute.id(), new RespondToDisputeRequest(response));
                        return true;
                    } catch (OrderConflictException conflict) {
                        return false;
                    } finally {
                        SecurityContextHolder.clearContext();
                    }
                }));
            }
            assertThat(List.of(
                            attempts.get(0).get(20, TimeUnit.SECONDS),
                            attempts.get(1).get(20, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(true, false);
        }
        var recorded = disputes.forOrder(dispute.orderId());
        assertThat(recorded.response()).isIn("First explanation", "Second explanation");
        assertThat(recorded.responderId()).isEqualTo(courier);
        assertThat(recorded.respondedAt()).isNotNull();
        assertThat(recorded.status()).isEqualTo(DisputeStatus.OPEN);
        assertThat(facts.events).isEmpty();
    }

    @Test
    void paymentWaitsForCreditConfirmationAndDoesNotRepeatTheEvent() {
        var id = accepted(true);
        var dispute = report(id);
        assertThatThrownBy(() -> orders.complete(id)).isInstanceOf(OrderConflictException.class);
        assertThatThrownBy(() -> disputes.list(PageRequest.of(0, 20))).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> disputes.resolve(
                        dispute.id(), new ResolveDisputeRequest(DisputeDecision.PAY_COURIER, "Not admin")))
                .isInstanceOf(AccessDeniedException.class);
        var processing = resolve(dispute, DisputeDecision.PAY_COURIER);
        assertThat(processing.status()).isEqualTo(DisputeStatus.PROCESSING);
        assertThat(orders.get(id).creditState().name()).isEqualTo("SETTLEMENT_PENDING");
        assertThat(disputes.list(PageRequest.of(0, 20)).total()).isEqualTo(1);
        assertThat(resolve(dispute, DisputeDecision.PAY_COURIER)).isEqualTo(processing);
        assertThat(facts.events).hasSize(1);
        var event = (ErrandCompletedEvent) facts.events.getFirst();
        assertThat(event.eventId()).isEqualTo(processing.settlementOperationId());
        assertThat(event.payload().requesterId()).isEqualTo(requester);
        assertThat(event.payload().courierId()).isEqualTo(courier);
        var result = new CreditPaidEvent(
                UUID.randomUUID(),
                1,
                OffsetDateTime.now(),
                new CreditPaidEvent.Payload(processing.settlementOperationId(), id, requester, 5, courier));
        orders.confirmPayment(result);
        var finished = orders.get(id);
        assertThat(finished.creditState().name()).isEqualTo("SETTLED");
        assertThat(finished.dispute().status()).isEqualTo(DisputeStatus.RESOLVED);
        assertThat(finished.dispute().settlementOutcome()).isEqualTo("PAID");
        assertThat(finished.dispute().adminId()).isEqualTo(admin);
        assertThat(finished.dispute().resolvedAt()).isNotNull();
        orders.confirmPayment(result);
        assertThat(orders.get(id).dispute()).isEqualTo(finished.dispute());
        assertThatThrownBy(() -> resolve(dispute, DisputeDecision.RELEASE_CREDITS))
                .isInstanceOf(OrderConflictException.class);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void releaseUsesTheRequesterAndPreservesTheAssignedCourier(boolean pickedUp) {
        var id = accepted(pickedUp);
        var dispute = report(id);
        if (!pickedUp) {
            assertThatThrownBy(() -> resolve(dispute, DisputeDecision.PAY_COURIER))
                    .isInstanceOf(OrderConflictException.class);
            assertThat(disputes.forOrder(id).decision()).isNull();
        }
        var processing = resolve(dispute, DisputeDecision.RELEASE_CREDITS);
        var order = orders.get(id);
        assertThat(order.status().name()).isEqualTo("CANCELLED");
        assertThat(order.courier().id()).isEqualTo(courier);
        assertThat(order.creditState().name()).isEqualTo("RELEASE_PENDING");
        var event = (ErrandCancelledEvent) facts.events.getFirst();
        assertThat(event.payload().requesterId()).isEqualTo(requester);
        assertThat(event.payload().amount()).isEqualTo(5);
        var result = new CreditRefundedEvent(
                UUID.randomUUID(),
                1,
                OffsetDateTime.now(),
                new CreditRefundedEvent.Payload(processing.settlementOperationId(), id, requester, 5));
        orders.confirmRefund(result);
        assertThat(orders.get(id).creditState().name()).isEqualTo("RELEASED");
        var finished = orders.get(id).dispute();
        assertThat(finished.status()).isEqualTo(DisputeStatus.RESOLVED);
        assertThat(finished.settlementOutcome()).isEqualTo("REFUNDED");
        orders.confirmRefund(result);
        assertThat(orders.get(id).dispute()).isEqualTo(finished);
    }

    @ParameterizedTest
    @EnumSource(
            value = DisputeDecision.class,
            names = {"PAY_COURIER", "RELEASE_CREDITS"})
    void reportedSettlementConflictLeavesTheOriginalDecisionForInvestigation(DisputeDecision decision) {
        var processing = resolve(report(accepted(true)), decision);
        if (decision == DisputeDecision.PAY_COURIER) {
            orders.recordPaymentDeclined(new CreditPaymentDeclinedEvent(
                    UUID.randomUUID(),
                    1,
                    OffsetDateTime.now(),
                    new CreditPaymentDeclinedEvent.Payload(
                            processing.settlementOperationId(),
                            processing.orderId(),
                            requester,
                            5,
                            courier,
                            "TERMINAL_CONFLICT")));
        } else {
            orders.recordRefundDeclined(new CreditRefundDeclinedEvent(
                    UUID.randomUUID(),
                    1,
                    OffsetDateTime.now(),
                    new CreditRefundDeclinedEvent.Payload(
                            processing.settlementOperationId(),
                            processing.orderId(),
                            requester,
                            5,
                            "TERMINAL_CONFLICT")));
        }
        var dispute = disputes.forOrder(processing.orderId());
        assertThat(dispute.status()).isEqualTo(DisputeStatus.NEEDS_ATTENTION);
        assertThat(dispute.decision()).isEqualTo(decision);
        assertThat(dispute.settlementOutcome()).isEqualTo("TERMINAL_CONFLICT");
        assertThat(dispute.resolvedAt()).isNull();
        var otherDecision =
                decision == DisputeDecision.PAY_COURIER ? DisputeDecision.RELEASE_CREDITS : DisputeDecision.PAY_COURIER;
        assertThatThrownBy(() -> resolve(dispute, otherDecision)).isInstanceOf(OrderConflictException.class);
    }

    @Test
    void competingAdminDecisionsCommitOnlyOneSettlementOperation() throws Exception {
        var dispute = report(accepted(true));
        var barrier = new CyclicBarrier(2);
        try (var executor = Executors.newFixedThreadPool(2)) {
            List<Future<Boolean>> attempts = new ArrayList<>();
            for (var decision : List.of(DisputeDecision.PAY_COURIER, DisputeDecision.RELEASE_CREDITS)) {
                attempts.add(executor.submit(() -> {
                    as(UUID.randomUUID(), "ADMIN");
                    try {
                        barrier.await(10, TimeUnit.SECONDS);
                        disputes.resolve(dispute.id(), new ResolveDisputeRequest(decision, "Concurrent review"));
                        return true;
                    } catch (OrderConflictException conflict) {
                        return false;
                    } finally {
                        SecurityContextHolder.clearContext();
                    }
                }));
            }
            assertThat(List.of(
                            attempts.get(0).get(20, TimeUnit.SECONDS),
                            attempts.get(1).get(20, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(true, false);
        }
        assertThat(facts.events).hasSize(1);
        var decided = disputes.forOrder(dispute.orderId());
        assertThat(decided.status()).isEqualTo(DisputeStatus.PROCESSING);
        assertThat(decided.settlementOperationId()).isNotNull();
        as(admin, "ADMIN");
        assertThat(orders.get(dispute.orderId()).status().name())
                .isEqualTo(decided.decision() == DisputeDecision.PAY_COURIER ? "COMPLETED" : "CANCELLED");
    }

    @Test
    void concurrentReportAndCompletionCannotBothSucceed() throws Exception {
        var id = accepted(true);
        var barrier = new CyclicBarrier(2);
        try (var executor = Executors.newFixedThreadPool(2)) {
            List<Future<Boolean>> attempts = new ArrayList<>();
            for (boolean reporting : List.of(true, false)) {
                attempts.add(executor.submit(() -> {
                    as(requester, "USER");
                    try {
                        barrier.await(10, TimeUnit.SECONDS);
                        if (reporting) disputes.report(id, new ReportDisputeRequest("Concurrent report"));
                        else orders.complete(id);
                        return true;
                    } catch (OrderConflictException conflict) {
                        return false;
                    } finally {
                        SecurityContextHolder.clearContext();
                    }
                }));
            }
            assertThat(List.of(
                            attempts.get(0).get(20, TimeUnit.SECONDS),
                            attempts.get(1).get(20, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(true, false);
        }
        as(requester, "USER");
        var order = orders.get(id);
        assertThat(order.status().name()).isEqualTo(order.dispute() == null ? "COMPLETED" : "PICKED_UP");
        assertThat(facts.events).hasSize(order.dispute() == null ? 1 : 0);
    }
}
