package com.cs3219.foc.order.service;

import static org.assertj.core.api.Assertions.*;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.cs3219.foc.order.config.DeliveryPhotoStorageProperties;
import com.cs3219.foc.order.config.OrderProperties;
import com.cs3219.foc.order.exception.CreditAccountPendingException;
import com.cs3219.foc.order.exception.DeliveryPhotoException;
import com.cs3219.foc.order.exception.OrderConflictException;
import com.cs3219.foc.order.exception.OrderCreationAttemptException;
import com.cs3219.foc.order.exception.OrderNotFoundException;
import com.cs3219.foc.order.infrastructure.client.*;
import com.cs3219.foc.order.infrastructure.storage.DeliveryPhotoStorage;
import com.cs3219.foc.order.integration.AbstractIntegrationTest;
import com.cs3219.foc.order.mapper.ErrandMapper;
import com.cs3219.foc.order.model.dto.*;
import com.cs3219.foc.order.model.dto.event.*;
import com.cs3219.foc.order.repository.ErrandRepository;
import com.cs3219.foc.order.security.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.stream.Collectors;
import javax.sql.DataSource;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mapstruct.factory.Mappers;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.*;
import org.springframework.context.event.EventListener;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.orm.jpa.*;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClientException;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@Import(OrderLifecyclePersistenceTests.TestConfig.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class OrderLifecyclePersistenceTests extends AbstractIntegrationTest {
    private static final Instant START = Instant.parse("2030-01-01T00:00:00Z");

    @Autowired
    private OrderService service;

    @Autowired
    private DeliveryService delivery;

    @Autowired
    private ChatService chat;

    @Autowired
    private DeliveryPhotoProcessor photoProcessor;

    @Autowired
    private DeliveryPhotoStorage photoStorage;

    @Autowired
    private DataSource dataSource;

    @Autowired
    private SupplierClient suppliers;

    @Autowired
    private CreditClient credit;

    @Autowired
    private UserClient users;

    @Autowired
    private TestClock clock;

    @Autowired
    private Facts facts;

    @Autowired
    private PlatformTransactionManager transactionManager;

    private JdbcTemplate jdbc;
    private UUID requester;

    @BeforeEach
    void prepare() {
        jdbc = new JdbcTemplate(dataSource);
        jdbc.execute(
                "TRUNCATE order_disputes, errands, delivery_photos, errand_messages, errand_chat_reads, event_publication");
        clock.time.set(START);
        facts.events.clear();
        reset(suppliers, users, credit, photoProcessor, photoStorage);
        when(photoProcessor.toJpeg(any())).thenReturn(new byte[] {1, 2, 3});
        when(photoStorage.readUrl(any(), any())).thenReturn("https://photos.test/handover.jpg");
        doAnswer(call -> {
                    assertThat(TransactionSynchronizationManager.isActualTransactionActive())
                            .isFalse();
                    return null;
                })
                .when(credit)
                .requireAccountReady();
        when(credit.reserve(any())).thenAnswer(call -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive())
                    .isFalse();
            ReserveCreditRequest request = call.getArgument(0);
            assertThat(request.operationId()).isEqualTo(request.errandId());
            assertThat(jdbc.queryForObject(
                            "SELECT credit_reward FROM errands WHERE id=?", Long.class, request.errandId()))
                    .isEqualTo(request.amount());
            return new CreditReservationResponse("RESERVED");
        });
        when(suppliers.get(any()))
                .thenAnswer(call -> new SupplierPickupDto(call.getArgument(0), "Cafe", "COM1", "01", "Lobby", true));
        when(users.find(any())).thenAnswer(call -> ((Set<UUID>) call.getArgument(0))
                .stream().collect(Collectors.toMap(id -> id, id -> new UserBriefDto(id, "User"))));
        requester = UUID.randomUUID();
        as(requester);
    }

    @AfterEach
    void clearActor() {
        SecurityContextHolder.clearContext();
    }

    private static void as(UUID id, String... roles) {
        var authorities = Arrays.stream(roles.length == 0 ? new String[] {"USER"} : roles)
                .map(role -> new SimpleGrantedAuthority("ROLE_" + role))
                .toList();
        SecurityContextHolder.getContext()
                .setAuthentication(new UsernamePasswordAuthenticationToken(id.toString(), "n/a", authorities));
    }

    // the current courier deliver the item with a photo
    private void deliver(UUID id) {
        deliverPhoto(id);
    }

    private ErrandActionResponse deliverPhoto(UUID id) {
        return delivery.deliver(id, List.of(photo()));
    }

    private static MockMultipartFile photo() {
        return new MockMultipartFile("photo", "handover.jpg", "image/jpeg", new byte[] {9});
    }

    private CreateErrandRequest request() {
        return new CreateErrandRequest(UUID.randomUUID(), UUID.randomUUID(), "COM2", "Lunch", null, 5, 1);
    }

    private UUID open() {
        as(requester);
        var created = service.create(request());
        assertThat(created.status().name()).isEqualTo("OPEN");
        return created.errandId();
    }

    @Test
    void retryMetadataIsOnlyExposedToTheRequesterInDetail() {
        var input = request();
        var id = service.create(input).errandId();
        assertThat(service.get(id).createRequestId()).isEqualTo(input.createRequestId());
        assertThat(service.mine("all", "active", PageRequest.of(0, 20))
                        .items()
                        .getFirst()
                        .createRequestId())
                .isNull();
        as(UUID.randomUUID());
        assertThat(service.get(id).createRequestId()).isNull();
        as(UUID.randomUUID(), "ADMIN");
    }

    @Test
    void mineSearchesTheItemAndBothLocations() {
        var latte = service.create(new CreateErrandRequest(
                        UUID.randomUUID(), UUID.randomUUID(), "UTown", "Iced latte", null, 5, 30))
                .errandId();
        var lunch = open();
        var page = PageRequest.of(0, 20);

        assertThat(service.mine("requester", "active", "LATTE", page).items())
                .extracting(ErrandDto::id)
                .containsExactly(latte);
        assertThat(service.mine("requester", "active", "utown", page).items())
                .extracting(ErrandDto::id)
                .containsExactly(latte);
        assertThat(service.mine("requester", "active", "cafe", page).items())
                .extracting(ErrandDto::id)
                .containsExactlyInAnyOrder(latte, lunch);
        assertThat(service.mine("requester", "active", "100%", page).items()).isEmpty();
    }

    @Test
    void mineFiltersBothRolesBeforePagingAndIncludesInternalStates() {
        UUID own = open();
        UUID other = UUID.randomUUID();
        as(other);
        UUID delivery = service.create(request()).errandId();
        as(requester);
        service.accept(delivery);
        var active = service.mine("all", "active", PageRequest.of(0, 1));
        assertThat(active.total()).isEqualTo(2);
        assertThat(active.items()).hasSize(1);
        assertThat(service.mine("courier", "active", PageRequest.of(0, 20)).items())
                .extracting(ErrandDto::id)
                .containsExactly(delivery);
        service.cancel(own);
        assertThat(service.mine("requester", "history", PageRequest.of(0, 20)).items())
                .extracting(ErrandDto::id)
                .containsExactly(own);
        jdbc.update(
                "UPDATE errands SET status='CREATING',credit_state=NULL,settlement_event_id=NULL,ended_at=NULL WHERE id=?",
                own);
        assertThat(service.mine("requester", "active", PageRequest.of(0, 20)).items())
                .hasSize(1);
        jdbc.update(
                "UPDATE errands SET status='CREATE_FAILED',creation_failure_code='INSUFFICIENT_BALANCE' WHERE id=?",
                own);
        assertThat(service.mine("requester", "history", PageRequest.of(0, 20)).items())
                .hasSize(1);
        assertThatThrownBy(() -> service.mine("invalid", "all", PageRequest.of(0, 20)))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> service.mine("all", "invalid", PageRequest.of(0, 20)))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void availableSearchIsCaseInsensitiveLiteralAndExcludesOwnAndExpiredOrders() {
        UUID own = open();
        UUID other = UUID.randomUUID();
        as(other);
        UUID visible = service.create(request()).errandId();
        jdbc.update("UPDATE errands SET description='Printed_100%!',delivery_location='Library' WHERE id=?", visible);
        as(requester);
        assertThat(service.list(null, "PRINTED_100%!", PageRequest.of(0, 20)).items())
                .extracting(ErrandDto::id)
                .containsExactly(visible);
        assertThat(service.list(null, "Library", PageRequest.of(0, 20)).items()).hasSize(1);
        assertThat(service.list(null, "Printed_101%", PageRequest.of(0, 20)).items())
                .isEmpty();
        assertThat(service.list(null, "Cafe", PageRequest.of(0, 20)).items())
                .extracting(ErrandDto::id)
                .doesNotContain(own);
        clock.time.set(START.plusSeconds(61));
        assertThat(service.list(null, "", PageRequest.of(0, 20)).items()).isEmpty();
    }

    private long count(Class<?> type) {
        return facts.events.stream().filter(type::isInstance).count();
    }

    private record CreditOperation(UUID operationId, UUID errandId, UUID requesterId, long amount, UUID courierId) {}

    private CreditOperation pendingSettlement(boolean payout) {
        UUID id = open();
        UUID courier = payout ? UUID.randomUUID() : null;
        if (payout) {
            as(courier);
            service.accept(id);
            service.pickUp(id);
            deliver(id);
            as(requester);
            service.complete(id);
        } else {
            service.cancel(id);
        }
        UUID operationId = jdbc.queryForObject("SELECT settlement_event_id FROM errands WHERE id=?", UUID.class, id);
        return new CreditOperation(operationId, id, requester, 5, courier);
    }

    private void confirm(boolean payout, CreditOperation p) {
        if (payout) {
            service.confirmPayment(new CreditPaidEvent(
                    UUID.randomUUID(),
                    1,
                    OffsetDateTime.now(clock),
                    new CreditPaidEvent.Payload(
                            p.operationId(), p.errandId(), p.requesterId(), p.amount(), p.courierId())));
        } else {
            service.confirmRefund(new CreditRefundedEvent(
                    UUID.randomUUID(),
                    1,
                    OffsetDateTime.now(clock),
                    new CreditRefundedEvent.Payload(p.operationId(), p.errandId(), p.requesterId(), p.amount())));
        }
    }

    private void decline(boolean payout, CreditOperation p, String reason) {
        if (payout) {
            service.recordPaymentDeclined(new CreditPaymentDeclinedEvent(
                    UUID.randomUUID(),
                    1,
                    OffsetDateTime.now(clock),
                    new CreditPaymentDeclinedEvent.Payload(
                            p.operationId(), p.errandId(), p.requesterId(), p.amount(), p.courierId(), reason)));
        } else {
            service.recordRefundDeclined(new CreditRefundDeclinedEvent(
                    UUID.randomUUID(),
                    1,
                    OffsetDateTime.now(clock),
                    new CreditRefundDeclinedEvent.Payload(
                            p.operationId(), p.errandId(), p.requesterId(), p.amount(), reason)));
        }
    }

    @Test
    void unreadyRequesterDoesNotCreateAndCanReuseTheRequestAfterProvisioning() {
        var req = request();
        doThrow(new CreditAccountPendingException()).when(credit).requireAccountReady();
        assertThatThrownBy(() -> service.create(req)).isInstanceOf(CreditAccountPendingException.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM errands", Long.class))
                .isZero();
        assertThat(facts.events).isEmpty();
        verifyNoInteractions(suppliers);
        doNothing().when(credit).requireAccountReady();
        var created = service.create(req);
        reset(credit);
        doThrow(new CreditAccountPendingException()).when(credit).requireAccountReady();
        assertThat(service.create(req).errandId()).isEqualTo(created.errandId());
        verifyNoInteractions(credit);
        assertThat(facts.events).isEmpty();
    }

    @Test
    void unreadyCourierDoesNotClaimTheOrderAndCanAcceptAfterProvisioning() {
        var id = open();
        var courier = UUID.randomUUID();
        as(courier);
        doThrow(new CreditAccountPendingException()).when(credit).requireAccountReady();
        assertThatThrownBy(() -> service.accept(id)).isInstanceOf(CreditAccountPendingException.class);
        assertThat(service.get(id).status().name()).isEqualTo("OPEN");
        assertThat(service.get(id).courier()).isNull();
        doNothing().when(credit).requireAccountReady();
        assertThat(service.accept(id).status().name()).isEqualTo("ACCEPTED");
        assertThat(service.get(id).courier().id()).isEqualTo(courier);
    }

    @Test
    void creationIsDurableAndNormalizesNotesWithoutRevalidatingExistingSupplier() {
        var req = request();
        var first = service.create(req);
        assertThat(first.status().name()).isEqualTo("OPEN");
        assertThat(facts.events).isEmpty();
        when(suppliers.get(any())).thenThrow(new AssertionError("Accepted requests must not query Supplier again"));
        var replay = new CreateErrandRequest(
                req.createRequestId(),
                req.supplierId(),
                req.deliveryLocation(),
                req.description(),
                "",
                req.creditReward(),
                req.expiryMinutes());
        assertThat(service.create(replay)).isEqualTo(first);
        verify(credit, times(1)).reserve(any());
        assertThatThrownBy(() -> service.create(new CreateErrandRequest(
                        req.createRequestId(), req.supplierId(), "Changed", req.description(), "", 5, 1)))
                .isInstanceOf(OrderConflictException.class);
    }

    @Test
    void simultaneousSameRequestCreatesOneOrderAndReusesTheReservationOperation() throws Exception {
        var barrier = new CyclicBarrier(2);
        when(suppliers.get(any())).thenAnswer(call -> {
            barrier.await(10, TimeUnit.SECONDS);
            return new SupplierPickupDto(call.getArgument(0), "Cafe", "COM1", null, null, true);
        });
        var req = request();
        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<CreateErrandResponse> submit = () -> {
                as(requester);
                return service.create(req);
            };
            var a = executor.submit(submit);
            var b = executor.submit(submit);
            assertThat(a.get(20, TimeUnit.SECONDS).errandId())
                    .isEqualTo(b.get(20, TimeUnit.SECONDS).errandId());
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM errands", Long.class))
                .isEqualTo(1);
        UUID id = jdbc.queryForObject("SELECT id FROM errands", UUID.class);
        var calls = ArgumentCaptor.forClass(ReserveCreditRequest.class);
        verify(credit, atLeastOnce()).reserve(calls.capture());
        assertThat(calls.getAllValues()).containsOnly(new ReserveCreditRequest(id, id, req.creditReward()));
    }

    @Test
    void inactiveSupplierIsRejectedEvenForAdmin() {
        as(requester, "ADMIN");
        when(suppliers.get(any()))
                .thenAnswer(call -> new SupplierPickupDto(call.getArgument(0), "Cafe", "COM1", null, null, false));
        assertThatThrownBy(() -> service.create(request())).isInstanceOf(ResponseStatusException.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM errands", Long.class))
                .isZero();
        verify(credit, never()).reserve(any());
    }

    @Test
    void ownerAndAdminFindInternalCreationRecordsButMarketplaceDoesNot() {
        var pendingRequest = request();
        doThrow(new RestClientException("Connection lost")).when(credit).reserve(any());
        assertThatThrownBy(() -> service.create(pendingRequest))
                .isInstanceOf(OrderCreationAttemptException.class)
                .hasCauseInstanceOf(RestClientException.class);
        var pending = jdbc.queryForObject(
                "SELECT id FROM errands WHERE create_request_id=?", UUID.class, pendingRequest.createRequestId());
        doReturn(new CreditReservationResponse("INSUFFICIENT_BALANCE"))
                .when(credit)
                .reserve(any());
        var failed = service.create(request()).errandId();
        assertThat(service.mine("requester", "all", PageRequest.of(0, 20)).items())
                .extracting(ErrandDto::id)
                .containsExactlyInAnyOrder(pending, failed);
        var outsider = UUID.randomUUID();
        as(outsider);
        assertThat(service.list(null, "", PageRequest.of(0, 20)).items()).isEmpty();
        assertThatThrownBy(() -> service.get(pending)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> service.list(requester, "", PageRequest.of(0, 20)))
                .isInstanceOf(AccessDeniedException.class);
        as(outsider, "ADMIN");
        assertThat(service.list(requester, "", PageRequest.of(0, 20)).items()).hasSize(2);
        assertThat(service.get(failed).creationFailureCode()).isEqualTo("INSUFFICIENT_BALANCE");
    }

    @Test
    void onlyOneCourierCanAcceptAndOwnOrderCannotBeAccepted() throws Exception {
        var id = open();
        assertThatThrownBy(() -> service.accept(id)).isInstanceOf(AccessDeniedException.class);
        var barrier = new CyclicBarrier(2);
        var successes = new AtomicInteger();
        var conflicts = new AtomicInteger();
        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<Void> accept = () -> {
                as(UUID.randomUUID());
                barrier.await(10, TimeUnit.SECONDS);
                try {
                    service.accept(id);
                    successes.incrementAndGet();
                } catch (OrderConflictException expected) {
                    conflicts.incrementAndGet();
                }
                return null;
            };
            var a = executor.submit(accept);
            var b = executor.submit(accept);
            a.get(20, TimeUnit.SECONDS);
            b.get(20, TimeUnit.SECONDS);
        }
        assertThat(successes.get()).isEqualTo(1);
        assertThat(conflicts.get()).isEqualTo(1);
        assertThat(service.get(id).status().name()).isEqualTo("ACCEPTED");
    }

    @Test
    void acceptAndCancelHaveOnlyOneWinningTransition() throws Exception {
        var id = open();
        var barrier = new CyclicBarrier(2);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var accept = executor.submit(() -> {
                as(UUID.randomUUID());
                barrier.await(10, TimeUnit.SECONDS);
                try {
                    service.accept(id);
                } catch (OrderConflictException expected) {
                }
                return true;
            });
            var cancel = executor.submit(() -> {
                as(requester);
                barrier.await(10, TimeUnit.SECONDS);
                try {
                    service.cancel(id);
                } catch (OrderConflictException expected) {
                }
                return true;
            });
            accept.get(20, TimeUnit.SECONDS);
            cancel.get(20, TimeUnit.SECONDS);
        }
        var state = service.get(id).status().name();
        assertThat(state).isIn("ACCEPTED", "CANCELLED");
        assertThat(count(ErrandCancelledEvent.class)).isEqualTo(state.equals("CANCELLED") ? 1 : 0);
    }

    @Test
    void pickupThenRequesterCompletionIsIdempotentAndPreservesSettlement() {
        var id = open();
        assertThatThrownBy(() -> service.complete(id)).isInstanceOf(OrderConflictException.class);
        var courier = UUID.randomUUID();
        as(courier);
        service.accept(id);
        as(requester);
        assertThatThrownBy(() -> service.pickUp(id)).isInstanceOf(AccessDeniedException.class);
        as(courier);
        service.pickUp(id);
        as(requester);
        // Picked up is not enough: the courier has to deliver it (with a photo) first.
        assertThatThrownBy(() -> service.complete(id)).isInstanceOf(OrderConflictException.class);
        as(courier);
        deliver(id);
        assertThatThrownBy(() -> service.complete(id)).isInstanceOf(AccessDeniedException.class);
        as(requester);
        service.complete(id);
        var completed = facts.events.stream()
                .filter(ErrandCompletedEvent.class::isInstance)
                .map(ErrandCompletedEvent.class::cast)
                .findFirst()
                .orElseThrow();
        SecurityContextHolder.clearContext();
        var result = new CreditPaidEvent(
                UUID.randomUUID(),
                1,
                OffsetDateTime.now(clock),
                new CreditPaidEvent.Payload(completed.eventId(), id, requester, 5, courier));
        service.confirmPayment(result);
        service.confirmPayment(result);
        as(requester);
        assertThat(service.complete(id).creditState().name()).isEqualTo("SETTLED");
        assertThat(count(ErrandCompletedEvent.class)).isEqualTo(1);
        as(UUID.randomUUID(), "ADMIN");
        assertThatThrownBy(() -> service.complete(id)).isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void lifecycleActionsSucceedWithoutLookingUpUserNames() {
        var completedId = open();
        var cancelledId = open();
        reset(users);
        when(users.find(any())).thenThrow(new AssertionError("Lifecycle actions must not query names"));

        as(UUID.randomUUID());
        assertThat(service.accept(completedId).errandId()).isEqualTo(completedId);
        assertThat(service.pickUp(completedId).status().name()).isEqualTo("PICKED_UP");
        deliver(completedId);
        as(requester);
        var completed = service.complete(completedId);
        assertThat(completed.status().name()).isEqualTo("COMPLETED");
        assertThat(completed.creditState().name()).isEqualTo("SETTLEMENT_PENDING");
        assertThat(service.complete(completedId)).isEqualTo(completed);
        var cancelled = service.cancel(cancelledId);
        assertThat(cancelled.errandId()).isEqualTo(cancelledId);
        assertThat(cancelled.status().name()).isEqualTo("CANCELLED");
        assertThat(cancelled.creditState().name()).isEqualTo("RELEASE_PENDING");
        assertThat(service.cancel(cancelledId)).isEqualTo(cancelled);
        verifyNoInteractions(users);
        assertThat(count(ErrandCompletedEvent.class)).isEqualTo(1);
        assertThat(count(ErrandCancelledEvent.class)).isEqualTo(1);
    }

    @Test
    void concurrentCompletionPublishesOnlyOneFact() throws Exception {
        var id = open();
        as(UUID.randomUUID());
        service.accept(id);
        service.pickUp(id);
        deliver(id);
        var barrier = new CyclicBarrier(2);
        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<Void> complete = () -> {
                as(requester);
                barrier.await(10, TimeUnit.SECONDS);
                service.complete(id);
                return null;
            };
            var a = executor.submit(complete);
            var b = executor.submit(complete);
            a.get(20, TimeUnit.SECONDS);
            b.get(20, TimeUnit.SECONDS);
        }
        assertThat(count(ErrandCompletedEvent.class)).isEqualTo(1);
    }

    @Test
    void cancellationAndRefundAreIdempotent() {
        var id = open();
        service.cancel(id);
        service.cancel(id);
        var cancelled = facts.events.stream()
                .filter(ErrandCancelledEvent.class::isInstance)
                .map(ErrandCancelledEvent.class::cast)
                .findFirst()
                .orElseThrow();
        var refund = new CreditRefundedEvent(
                UUID.randomUUID(),
                1,
                OffsetDateTime.now(clock),
                new CreditRefundedEvent.Payload(cancelled.eventId(), id, requester, 5));
        service.confirmRefund(refund);
        service.confirmRefund(refund);
        assertThat(service.cancel(id).creditState().name()).isEqualTo("RELEASED");
        assertThat(count(ErrandCancelledEvent.class)).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void mismatchedSettlementResultsDoNotConfirmFunds(boolean payout) {
        var original = pendingSettlement(payout);
        var before = service.get(original.errandId());
        int eventCount = facts.events.size();
        for (String mismatch : List.of("operationId", "requesterId", "amount", "eventType")) {
            var changed = new CreditOperation(
                    mismatch.equals("operationId") ? UUID.randomUUID() : original.operationId(),
                    original.errandId(),
                    mismatch.equals("requesterId") ? UUID.randomUUID() : original.requesterId(),
                    mismatch.equals("amount") ? original.amount() + 1 : original.amount(),
                    original.courierId());
            assertThatThrownBy(() -> confirm(mismatch.equals("eventType") ? !payout : payout, changed))
                    .as("payout=%s, mismatch=%s", payout, mismatch)
                    .isInstanceOf(IllegalArgumentException.class);
            assertThatThrownBy(() ->
                            decline(mismatch.equals("eventType") ? !payout : payout, changed, "TERMINAL_CONFLICT"))
                    .isInstanceOf(IllegalArgumentException.class);
            assertThat(service.get(original.errandId())).isEqualTo(before);
            assertThat(facts.events).hasSize(eventCount);
        }
        if (payout) {
            var changed = new CreditOperation(
                    original.operationId(),
                    original.errandId(),
                    original.requesterId(),
                    original.amount(),
                    UUID.randomUUID());
            assertThatThrownBy(() -> confirm(true, changed)).isInstanceOf(IllegalArgumentException.class);
            assertThatThrownBy(() -> decline(true, changed, "TERMINAL_CONFLICT"))
                    .isInstanceOf(IllegalArgumentException.class);
        }
        assertThatThrownBy(() -> decline(payout, original, "UNEXPECTED")).isInstanceOf(IllegalArgumentException.class);
        confirm(payout, original);
        assertThat(service.get(original.errandId()).creditState().name()).isEqualTo(payout ? "SETTLED" : "RELEASED");
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void businessConflictsLeaveSettlementPendingWithoutPublishingAnotherFact(boolean payout) {
        var original = pendingSettlement(payout);
        var before = service.get(original.errandId());
        int eventCount = facts.events.size();
        for (String reason : List.of("RESERVATION_MISMATCH", "NO_RESERVATION", "TERMINAL_CONFLICT")) {
            assertThatCode(() -> decline(payout, original, reason)).doesNotThrowAnyException();
            assertThat(service.get(original.errandId())).isEqualTo(before);
            assertThat(facts.events).hasSize(eventCount);
        }
        confirm(payout, original);
        assertThat(service.get(original.errandId()).creditState().name()).isEqualTo(payout ? "SETTLED" : "RELEASED");
    }

    @Test
    void expiryWaitsForInFlightAcceptanceAndDoesNotExpireTheAcceptedOrder() throws Exception {
        UUID id = open();
        UUID courier = UUID.randomUUID();
        // This test adds an outer transaction only to hold the row lock after acceptance returns.
        doNothing().when(credit).requireAccountReady();
        var acceptedButUncommitted = new CountDownLatch(1);
        var allowCommit = new CountDownLatch(1);
        var acceptingBackend = new AtomicInteger();
        try (var executor = Executors.newFixedThreadPool(2)) {
            var acceptance = executor.submit(() -> {
                as(courier);
                try {
                    // Keep the real acceptance transaction open while expiry sees the previous OPEN row.
                    new TransactionTemplate(transactionManager).executeWithoutResult(tx -> {
                        service.accept(id);
                        acceptingBackend.set(jdbc.queryForObject("SELECT pg_backend_pid()", Integer.class));
                        acceptedButUncommitted.countDown();
                        try {
                            assertThat(allowCommit.await(10, TimeUnit.SECONDS)).isTrue();
                        } catch (InterruptedException exception) {
                            Thread.currentThread().interrupt();
                            throw new IllegalStateException(exception);
                        }
                    });
                } finally {
                    SecurityContextHolder.clearContext();
                }
            });
            try {
                assertThat(acceptedButUncommitted.await(10, TimeUnit.SECONDS)).isTrue();
                clock.time.set(START.plusSeconds(61));
                var expiry = executor.submit(service::expireOpenOrders);
                // Observe a PostgreSQL lock wait, rather than merely starting two threads together.
                await().atMost(Duration.ofSeconds(5)).untilAsserted(() -> assertThat(jdbc.queryForObject(
                                "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE ? = ANY(pg_blocking_pids(pid)))",
                                Boolean.class,
                                acceptingBackend.get()))
                        .isTrue());
                allowCommit.countDown();
                acceptance.get(10, TimeUnit.SECONDS);
                expiry.get(10, TimeUnit.SECONDS);
            } finally {
                allowCommit.countDown();
            }
        }
        var order = service.get(id);
        assertThat(order.status().name()).isEqualTo("ACCEPTED");
        assertThat(order.creditState().name()).isEqualTo("RESERVED");
        assertThat(order.courier().id()).isEqualTo(courier);
        assertThat(count(ErrandExpiredEvent.class)).isZero();
    }

    @Test
    void expiryRejectsLateAcceptanceAndDoesNotExpireAcceptedOrPickedUpOrders() {
        var accepted = open();
        var expired = open();
        var courier = UUID.randomUUID();
        as(courier);
        service.accept(accepted);
        clock.time.set(START.plusSeconds(61));
        assertThatThrownBy(() -> service.accept(expired)).isInstanceOf(OrderConflictException.class);
        SecurityContextHolder.clearContext();
        service.expireOpenOrders();
        as(courier);
        service.pickUp(accepted);
        SecurityContextHolder.clearContext();
        service.expireOpenOrders();
        as(requester);
        assertThat(service.get(accepted).status().name()).isEqualTo("PICKED_UP");
        assertThat(service.get(expired).status().name()).isEqualTo("EXPIRED");
        assertThat(count(ErrandExpiredEvent.class)).isEqualTo(1);
    }

    @Test
    void synchronousReservationFinishingAfterExpiryIsReleasedWithoutOpening() {
        doAnswer(call -> {
                    clock.time.set(START.plusSeconds(61));
                    return new CreditReservationResponse("RESERVED");
                })
                .when(credit)
                .reserve(any());
        var req = request();
        var created = service.create(req);
        assertThat(created.status().name()).isEqualTo("EXPIRED");
        assertThat(service.get(created.errandId()).creditState().name()).isEqualTo("RELEASE_PENDING");
        assertThat(service.create(req)).isEqualTo(created);
        verify(credit, times(1)).reserve(any());
        assertThat(count(ErrandExpiredEvent.class)).isEqualTo(1);
    }

    @Test
    void insufficientBalanceIsReturnedImmediatelyAndItsDecisionIsStable() {
        doReturn(new CreditReservationResponse("INSUFFICIENT_BALANCE"))
                .when(credit)
                .reserve(any());
        var req = request();
        var created = service.create(req);
        assertThat(created.status().name()).isEqualTo("CREATE_FAILED");
        assertThat(created.creationFailureCode()).isEqualTo("INSUFFICIENT_BALANCE");
        assertThat(service.get(created.errandId()).creditState()).isNull();
        assertThat(service.create(req)).isEqualTo(created);
        verify(credit, times(1)).reserve(any());
        assertThat(facts.events).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"RESERVED", "INSUFFICIENT_BALANCE"})
    void uncertainHttpResultCanRecoverUsingTheOriginalRequestWithoutRevalidatingAdmission(String outcome) {
        doThrow(new RestClientException("Response lost"))
                .doReturn(new CreditReservationResponse(outcome))
                .when(credit)
                .reserve(any());
        var req = request();
        assertThatThrownBy(() -> service.create(req))
                .isInstanceOf(OrderCreationAttemptException.class)
                .hasCauseInstanceOf(RestClientException.class);
        UUID id = jdbc.queryForObject("SELECT id FROM errands", UUID.class);
        var original = service.get(id);
        assertThat(original.status().name()).isEqualTo("CREATING");
        doThrow(new AssertionError("Retry must not check readiness again"))
                .when(credit)
                .requireAccountReady();
        doThrow(new AssertionError("Retry must retain the original supplier snapshot"))
                .when(suppliers)
                .get(any());

        assertThatThrownBy(() -> service.create(new CreateErrandRequest(
                        req.createRequestId(),
                        req.supplierId(),
                        "Changed",
                        req.description(),
                        req.notes(),
                        req.creditReward(),
                        req.expiryMinutes())))
                .isInstanceOf(OrderConflictException.class);
        var recovered = service.retryCreation(jdbc.queryForObject(
                "SELECT id FROM errands WHERE create_request_id=?", UUID.class, req.createRequestId()));
        assertThat(recovered.errandId()).isEqualTo(id);
        assertThat(recovered.status().name()).isEqualTo(outcome.equals("RESERVED") ? "OPEN" : "CREATE_FAILED");
        assertThat(recovered.creationFailureCode()).isEqualTo(outcome.equals("RESERVED") ? null : outcome);
        assertThat(service.get(id).expiresAt()).isEqualTo(original.expiresAt());
        assertThat(service.get(id).createdAt()).isEqualTo(original.createdAt());
        verify(credit, times(2)).reserve(new ReserveCreditRequest(id, id, req.creditReward()));
        assertThat(service.create(req)).isEqualTo(recovered);
        verify(credit).requireAccountReady();
        verifyNoMoreInteractions(credit);
        assertThat(facts.events).isEmpty();
    }

    @Test
    void retryCreationIsRestrictedToTheOriginalRequesterEvenForAdmins() {
        doThrow(new RestClientException("Response lost")).when(credit).reserve(any());
        assertThatThrownBy(() -> service.create(request())).isInstanceOf(OrderCreationAttemptException.class);
        UUID id = jdbc.queryForObject("SELECT id FROM errands", UUID.class);
        clearInvocations(credit);
        as(UUID.randomUUID(), "ADMIN");
        assertThatThrownBy(() -> service.retryCreation(id)).isInstanceOf(AccessDeniedException.class);
        as(UUID.randomUUID());
        assertThatThrownBy(() -> service.retryCreation(id)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> service.retryCreation(UUID.randomUUID())).isInstanceOf(OrderNotFoundException.class);
        verifyNoInteractions(credit);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "OPEN",
                "ACCEPTED",
                "PICKED_UP",
                "DELIVERED",
                "COMPLETED",
                "CANCELLED",
                "EXPIRED",
                "CREATE_FAILED"
            })
    void retryCreationReturnsAlreadyResolvedOrdersWithoutAnotherReservation(String state) {
        UUID id = service.create(request()).errandId();
        jdbc.update("UPDATE errands SET status=? WHERE id=?", state, id);
        clearInvocations(credit);
        assertThat(service.retryCreation(id).status().name()).isEqualTo(state);
        verifyNoInteractions(credit);
        assertThat(facts.events).isEmpty();
    }

    @Test
    void persistentHttpFailureKeepsTheOriginalRecordAvailableForAnotherRetry() {
        doThrow(new RestClientException("Credit unavailable")).when(credit).reserve(any());
        var req = request();
        assertThatThrownBy(() -> service.create(req))
                .isInstanceOf(OrderCreationAttemptException.class)
                .hasCauseInstanceOf(RestClientException.class);
        assertThatThrownBy(() -> service.create(req))
                .isInstanceOf(OrderCreationAttemptException.class)
                .hasCauseInstanceOf(RestClientException.class);
        UUID id = jdbc.queryForObject("SELECT id FROM errands", UUID.class);
        assertThat(service.get(id).status().name()).isEqualTo("CREATING");
        assertThat(service.get(id).creditState()).isNull();
        verify(credit, times(2)).reserve(new ReserveCreditRequest(id, id, req.creditReward()));
        assertThat(facts.events).isEmpty();
    }

    @Test
    void successfulReservationFollowedByDatabaseFailureCanBeFinalizedByTheOriginalRequest() {
        var req = request();
        jdbc.execute("ALTER TABLE errands ADD CONSTRAINT reject_open CHECK(status <> 'OPEN') NOT VALID");
        UUID id;
        try {
            assertThatThrownBy(() -> service.create(req))
                    .isInstanceOf(OrderCreationAttemptException.class)
                    .hasCauseInstanceOf(DataIntegrityViolationException.class);
            id = jdbc.queryForObject("SELECT id FROM errands", UUID.class);
            assertThat(service.get(id).status().name()).isEqualTo("CREATING");
        } finally {
            jdbc.execute("ALTER TABLE errands DROP CONSTRAINT reject_open");
        }
        var recovered = service.retryCreation(jdbc.queryForObject(
                "SELECT id FROM errands WHERE create_request_id=?", UUID.class, req.createRequestId()));
        assertThat(recovered.errandId()).isEqualTo(id);
        assertThat(recovered.status().name()).isEqualTo("OPEN");
        verify(credit, times(2)).reserve(new ReserveCreditRequest(id, id, req.creditReward()));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM errands", Long.class))
                .isEqualTo(1);
    }

    @Test
    void retryAfterExpiryReleasesTheConfirmedReservationOnce() {
        doThrow(new RestClientException("Response lost"))
                .doReturn(new CreditReservationResponse("RESERVED"))
                .when(credit)
                .reserve(any());
        var req = request();
        assertThatThrownBy(() -> service.create(req))
                .isInstanceOf(OrderCreationAttemptException.class)
                .hasCauseInstanceOf(RestClientException.class);
        clock.time.set(START.plusSeconds(61));
        var recovered = service.retryCreation(jdbc.queryForObject(
                "SELECT id FROM errands WHERE create_request_id=?", UUID.class, req.createRequestId()));
        assertThat(recovered.status().name()).isEqualTo("EXPIRED");
        assertThat(service.get(recovered.errandId()).creditState().name()).isEqualTo("RELEASE_PENDING");
        assertThat(service.create(req)).isEqualTo(recovered);
        verify(credit, times(2))
                .reserve(new ReserveCreditRequest(recovered.errandId(), recovered.errandId(), req.creditReward()));
        assertThat(count(ErrandExpiredEvent.class)).isEqualTo(1);
    }

    @Test
    void invalidReservationResponsesLeaveTheOriginalCreationAvailableForRetry() {
        var responses =
                Arrays.asList(null, new CreditReservationResponse(null), new CreditReservationResponse("UNKNOWN"));
        for (CreditReservationResponse response : responses) {
            doReturn(response).when(credit).reserve(any());
            var req = request();
            assertThatThrownBy(() -> service.create(req))
                    .isInstanceOf(OrderCreationAttemptException.class)
                    .hasCauseInstanceOf(RestClientException.class);
            UUID id = jdbc.queryForObject(
                    "SELECT id FROM errands WHERE create_request_id=?", UUID.class, req.createRequestId());
            assertThat(service.get(id).status().name()).isEqualTo("CREATING");
            doReturn(new CreditReservationResponse("RESERVED")).when(credit).reserve(any());
            assertThat(service.create(req).errandId()).isEqualTo(id);
            assertThat(service.get(id).status().name()).isEqualTo("OPEN");
        }
        assertThat(facts.events).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"ACCEPTED", "COMPLETED", "CANCELLED", "EXPIRED"})
    void lateOriginalCreationDoesNotOverwriteTheStateReachedAfterRetry(String targetStatus) throws Exception {
        var firstWaiting = new CountDownLatch(1);
        var releaseFirst = new CountDownLatch(1);
        var attempts = new AtomicInteger();
        doAnswer(call -> {
                    assertThat(TransactionSynchronizationManager.isActualTransactionActive())
                            .isFalse();
                    if (attempts.incrementAndGet() == 1) {
                        firstWaiting.countDown();
                        assertThat(releaseFirst.await(10, TimeUnit.SECONDS)).isTrue();
                    }
                    return new CreditReservationResponse("RESERVED");
                })
                .when(credit)
                .reserve(any());
        var req = request();
        try (var executor = Executors.newSingleThreadExecutor()) {
            Future<CreateErrandResponse> original = executor.submit(() -> {
                as(requester);
                try {
                    return service.create(req);
                } finally {
                    SecurityContextHolder.clearContext();
                }
            });
            try {
                assertThat(firstWaiting.await(10, TimeUnit.SECONDS)).isTrue();
                var recovered = service.retryCreation(jdbc.queryForObject(
                        "SELECT id FROM errands WHERE create_request_id=?", UUID.class, req.createRequestId()));
                UUID id = recovered.errandId();
                assertThat(recovered.status().name()).isEqualTo("OPEN");
                UUID courier = null;
                if (targetStatus.equals("ACCEPTED") || targetStatus.equals("COMPLETED")) {
                    courier = UUID.randomUUID();
                    as(courier);
                    service.accept(id);
                    if (targetStatus.equals("COMPLETED")) {
                        service.pickUp(id);
                        deliver(id);
                        as(requester);
                        service.complete(id);
                    }
                } else if (targetStatus.equals("CANCELLED")) {
                    service.cancel(id);
                } else {
                    clock.time.set(START.plusSeconds(61));
                    service.expireOpenOrders();
                }
                if (!targetStatus.equals("ACCEPTED")) {
                    boolean payout = targetStatus.equals("COMPLETED");
                    UUID operation =
                            jdbc.queryForObject("SELECT settlement_event_id FROM errands WHERE id=?", UUID.class, id);
                    confirm(payout, new CreditOperation(operation, id, requester, req.creditReward(), courier));
                }
                as(requester);
                ErrandDto advanced = service.get(id);
                assertThat(advanced.status().name()).isEqualTo(targetStatus);
                releaseFirst.countDown();
                assertThat(original.get(10, TimeUnit.SECONDS).status().name()).isEqualTo(targetStatus);
                assertThat(service.get(id)).isEqualTo(advanced);
                verify(credit, times(2)).reserve(new ReserveCreditRequest(id, id, req.creditReward()));
                assertThat(facts.events).hasSize(targetStatus.equals("ACCEPTED") ? 0 : 1);
            } finally {
                releaseFirst.countDown();
            }
        }
    }

    @Test
    void onlyTheCourierCanDeliverAndOnlyAfterPickup() {
        var id = open();
        var courier = UUID.randomUUID();
        as(courier);
        service.accept(id);
        assertThatThrownBy(() -> deliver(id)).isInstanceOf(OrderConflictException.class);
        service.pickUp(id);
        as(requester);
        assertThatThrownBy(() -> deliver(id)).isInstanceOf(AccessDeniedException.class);
        as(UUID.randomUUID());
        assertThatThrownBy(() -> deliver(id)).isInstanceOf(AccessDeniedException.class);
        verifyNoInteractions(photoStorage);

        as(courier);
        clock.time.set(START.plusSeconds(30));
        assertThat(deliverPhoto(id).status().name()).isEqualTo("DELIVERED");
        var key = ArgumentCaptor.forClass(String.class);
        verify(photoStorage).putJpeg(key.capture(), eq(new byte[] {1, 2, 3}));
        assertThat(key.getValue()).startsWith("delivery-photos/" + id + "/").endsWith(".jpg");
        assertThat(jdbc.queryForList("SELECT photo_key FROM delivery_photos WHERE errand_id=?", String.class, id))
                .containsExactly(key.getValue());
        var dto = service.get(id);
        assertThat(dto.hasDeliveryPhoto()).isTrue();
        assertThat(dto.deliveredAt()).isEqualTo(OffsetDateTime.ofInstant(START.plusSeconds(30), ZoneOffset.UTC));
        // delivering twice is refused, more photos are added separately
        assertThatThrownBy(() -> deliver(id)).isInstanceOf(OrderConflictException.class);
        verify(photoStorage, times(1)).putJpeg(any(), any());
    }

    @Test
    void courierSubmitsAllPhotosTogetherAndCannotChangeThemAfterwards() {
        var id = open();
        var courier = UUID.randomUUID();
        as(courier);
        service.accept(id);
        service.pickUp(id);
        List<MultipartFile> tooMany = Collections.nCopies(DeliveryService.MAX_PHOTOS + 1, photo());
        for (List<MultipartFile> refused : List.of(List.<MultipartFile>of(), tooMany)) {
            assertThatThrownBy(() -> delivery.deliver(id, refused))
                    .isInstanceOfSatisfying(
                            DeliveryPhotoException.class,
                            e -> assertThat(e.getStatus().value()).isEqualTo(400));
        }
        verifyNoInteractions(photoStorage);

        var keys = ArgumentCaptor.forClass(String.class);
        delivery.deliver(id, Collections.nCopies(DeliveryService.MAX_PHOTOS, photo()));
        verify(photoStorage, times(DeliveryService.MAX_PHOTOS)).putJpeg(keys.capture(), any());
        // listed the photos in the order of when courier chose them
        assertThat(jdbc.queryForList(
                        "SELECT photo_key FROM delivery_photos WHERE errand_id=? ORDER BY created_at",
                        String.class,
                        id))
                .containsExactlyElementsOf(keys.getAllValues());
        assertThat(delivery.photos(id)).hasSize(DeliveryService.MAX_PHOTOS);
        // once submitted, the photos are fixed
        assertThatThrownBy(() -> deliver(id)).isInstanceOf(OrderConflictException.class);
        assertThat(delivery.photos(id)).hasSize(DeliveryService.MAX_PHOTOS);
    }

    @Test
    void aFailedSubmissionStoresNothingAndCleansUpUploadedPhotos() {
        var id = open();
        var courier = UUID.randomUUID();
        as(courier);
        service.accept(id);
        service.pickUp(id);
        // one unusable photo will reject the entire submission before anything is uploaded
        when(photoProcessor.toJpeg(any()))
                .thenReturn(new byte[] {1})
                .thenThrow(new DeliveryPhotoException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Not an image"));
        assertThatThrownBy(() -> delivery.deliver(id, List.of(photo(), photo())))
                .isInstanceOf(DeliveryPhotoException.class);
        verifyNoInteractions(photoStorage);

        // if the storage failing halfway, then the photo already stored will be remove again
        doReturn(new byte[] {1}).when(photoProcessor).toJpeg(any());
        doNothing()
                .doThrow(new DeliveryPhotoException(HttpStatus.SERVICE_UNAVAILABLE, "S3 down"))
                .when(photoStorage)
                .putJpeg(any(), any());
        assertThatThrownBy(() -> delivery.deliver(id, List.of(photo(), photo())))
                .isInstanceOf(DeliveryPhotoException.class);
        var stored = ArgumentCaptor.forClass(String.class);
        verify(photoStorage, times(2)).putJpeg(stored.capture(), any());
        verify(photoStorage).delete(stored.getAllValues().getFirst());
        assertThat(service.get(id).status().name()).isEqualTo("PICKED_UP");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM delivery_photos", Long.class))
                .isZero();
    }

    @Test
    void deliveryPhotosAreVisibleToTheTwoPartiesAndAdminsOnly() {
        var id = open();
        var courier = UUID.randomUUID();
        as(courier);
        service.accept(id);
        service.pickUp(id);
        assertThat(delivery.photos(id)).isEmpty();
        deliver(id);

        var photos = delivery.photos(id);
        assertThat(photos).singleElement().satisfies(photo -> {
            assertThat(photo.url()).isEqualTo("https://photos.test/handover.jpg");
            assertThat(photo.expiresAt()).isEqualTo(OffsetDateTime.ofInstant(START.plusSeconds(600), ZoneOffset.UTC));
        });
        verify(photoStorage).readUrl(any(), eq(Duration.ofMinutes(10)));
        as(requester);
        assertThat(delivery.photos(id)).hasSize(1);
        as(UUID.randomUUID(), "ADMIN");
        assertThat(delivery.photos(id)).hasSize(1);
        as(UUID.randomUUID());
        assertThatThrownBy(() -> delivery.photos(id)).isInstanceOf(AccessDeniedException.class);
    }

    private ErrandMessageDto say(UUID errand, String body) {
        return chat.send(errand, new SendMessageRequest(UUID.randomUUID(), body));
    }

    @Test
    void chatOpensWhenACourierAcceptsAndBecomesReadOnlyAfterConfirmation() {
        var id = open();
        var courier = UUID.randomUUID();
        // No courier yet: nobody to talk to.
        assertThatThrownBy(() -> say(id, "Hello?")).isInstanceOf(AccessDeniedException.class);
        as(courier);
        service.accept(id);

        as(requester);
        clock.time.set(START.plusSeconds(10));
        var first = say(id, "  Less ice please  ");
        assertThat(first.body()).isEqualTo("Less ice please");
        assertThat(first.senderId()).isEqualTo(requester);
        as(courier);
        clock.time.set(START.plusSeconds(20));
        say(id, "Got it!");
        as(UUID.randomUUID());
        assertThatThrownBy(() -> say(id, "Hi")).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> chat.chat(id)).isInstanceOf(AccessDeniedException.class);
        // Admins can read the conversation but not take part.
        as(UUID.randomUUID(), "ADMIN");
        assertThat(chat.chat(id).messages())
                .extracting(ErrandMessageDto::body)
                .containsExactly("Less ice please", "Got it!");
        assertThatThrownBy(() -> say(id, "Hi")).isInstanceOf(AccessDeniedException.class);

        // Each message is announced to both people.
        var posted = facts.events.stream()
                .filter(ErrandMessagePostedEvent.class::isInstance)
                .map(ErrandMessagePostedEvent.class::cast)
                .toList();
        assertThat(posted).hasSize(2);
        assertThat(posted.getFirst().payload())
                .isEqualTo(new ErrandMessagePostedEvent.Payload(
                        first.id(),
                        id,
                        requester,
                        List.of(requester, courier),
                        "Less ice please",
                        null,
                        first.sentAt()));

        // Still open while the item is on the way and after delivery.
        as(courier);
        service.pickUp(id);
        say(id, "On my way");
        deliver(id);
        say(id, "Left it at the door");
        as(requester);
        service.complete(id);
        assertThatThrownBy(() -> say(id, "Thanks!")).isInstanceOf(OrderConflictException.class);
        assertThat(chat.chat(id).messages()).hasSize(4);
    }

    @Test
    void retryingTheSameMessageStoresAndAnnouncesItOnce() {
        var id = open();
        var courier = UUID.randomUUID();
        as(courier);
        service.accept(id);
        as(requester);
        var request = new SendMessageRequest(UUID.randomUUID(), "Are you there?");
        var sent = chat.send(id, request);
        assertThat(chat.send(id, request)).isEqualTo(sent);
        assertThat(chat.chat(id).messages()).hasSize(1);
        assertThat(count(ErrandMessagePostedEvent.class)).isEqualTo(1);
        // Someone else cannot reuse that id.
        as(courier);
        assertThatThrownBy(() -> chat.send(id, new SendMessageRequest(request.id(), "Mine")))
                .isInstanceOf(OrderConflictException.class);
    }

    /** An accepted errand between the requester and a new courier; returns the courier. */
    private UUID acceptedChat(UUID id) {
        var courier = UUID.randomUUID();
        as(courier);
        service.accept(id);
        return courier;
    }

    private static MockMultipartFile file(String name, String type, byte[] content) {
        return new MockMultipartFile("file", name, type, content);
    }

    // The first bytes of an MP4 or MOV file: a box size, "ftyp", then the brand.
    private static byte[] mp4(String brand) {
        var bytes = Arrays.copyOf(new byte[] {0, 0, 0, 32, 'f', 't', 'y', 'p'}, 64);
        for (int i = 0; i < 4; i++) bytes[8 + i] = (byte) brand.charAt(i);
        return bytes;
    }

    @Test
    void photosAndVideosCanBeSentAndAreStoredPrivately() {
        var id = open();
        var courier = acceptedChat(id);
        as(courier);
        clock.time.set(START.plusSeconds(10));
        var photo = chat.sendAttachment(id, UUID.randomUUID(), file("a.png", "image/png", new byte[] {9}));
        assertThat(photo.body()).isNull();
        assertThat(photo.attachment().type()).isEqualTo("IMAGE");
        assertThat(photo.attachment().url()).isEqualTo("https://photos.test/handover.jpg");
        var stored = ArgumentCaptor.forClass(String.class);
        verify(photoStorage).put(stored.capture(), eq(new byte[] {1, 2, 3}), eq("image/jpeg"));
        assertThat(stored.getValue()).startsWith("chat/" + id + "/").endsWith(".jpg");

        clock.time.set(START.plusSeconds(20));
        var video = chat.sendAttachment(id, UUID.randomUUID(), file("clip.mov", "video/quicktime", mp4("qt  ")));
        assertThat(video.attachment().type()).isEqualTo("VIDEO");
        verify(photoStorage).put(argThat(key -> key.endsWith(".mov")), any(), eq("video/quicktime"));
        chat.sendAttachment(id, UUID.randomUUID(), file("clip.mp4", "video/mp4", mp4("isom")));
        verify(photoStorage).put(argThat(key -> key.endsWith(".mp4")), any(), eq("video/mp4"));

        // The other person is told what kind of file arrived; the link is fetched with the chat.
        var announced = facts.events.stream()
                .filter(ErrandMessagePostedEvent.class::isInstance)
                .map(event -> ((ErrandMessagePostedEvent) event).payload().attachmentType())
                .toList();
        assertThat(announced).containsExactly("IMAGE", "VIDEO", "VIDEO");
        as(requester);
        assertThat(chat.chat(id).messages())
                .extracting(message -> message.attachment().type())
                .containsExactly("IMAGE", "VIDEO", "VIDEO");
    }

    @Test
    void unsupportedFilesAndStrangersAreRefusedAndLateFilesRemoved() {
        var id = open();
        var courier = acceptedChat(id);
        as(courier);
        // Not a real video, whatever its name says.
        assertThatThrownBy(() -> chat.sendAttachment(id, UUID.randomUUID(), file("x.mp4", "video/mp4", new byte[64])))
                .isInstanceOfSatisfying(
                        DeliveryPhotoException.class,
                        e -> assertThat(e.getStatus().value()).isEqualTo(415));
        as(UUID.randomUUID());
        assertThatThrownBy(() -> chat.sendAttachment(id, UUID.randomUUID(), file("a.png", "image/png", new byte[] {9})))
                .isInstanceOf(AccessDeniedException.class);
        verify(photoStorage, never()).put(any(), any(), any());

        // The errand closes while the file uploads: the message is refused and the file removed again.
        as(courier);
        doAnswer(call -> jdbc.update("UPDATE errands SET status='CANCELLED' WHERE id=?", id))
                .when(photoStorage)
                .put(any(), any(), any());
        assertThatThrownBy(() -> chat.sendAttachment(id, UUID.randomUUID(), file("a.png", "image/png", new byte[] {9})))
                .isInstanceOf(OrderConflictException.class);
        var stored = ArgumentCaptor.forClass(String.class);
        verify(photoStorage).put(stored.capture(), any(), any());
        verify(photoStorage).delete(stored.getValue());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM errand_messages", Long.class))
                .isZero();
    }

    @Test
    void afterConfirmationNoFilesCanBeSent() {
        var id = open();
        var courier = acceptedChat(id);
        // After confirmation nothing more can be sent.
        as(courier);
        service.pickUp(id);
        deliver(id);
        as(requester);
        service.complete(id);
        as(courier);
        clearInvocations(photoStorage);
        assertThatThrownBy(() -> chat.sendAttachment(id, UUID.randomUUID(), file("a.png", "image/png", new byte[] {9})))
                .isInstanceOf(OrderConflictException.class);
        verify(photoStorage, never()).put(any(), any(), any());
    }

    @Test
    void readReceiptsOnlyMoveForwardAndAreAnnouncedToBoth() {
        var id = open();
        var courier = acceptedChat(id);
        as(requester);
        clock.time.set(START.plusSeconds(10));
        var first = say(id, "Hi");
        clock.time.set(START.plusSeconds(20));
        var second = say(id, "Are you there?");
        // Reading your own messages changes nothing.
        chat.markRead(id, second.id());
        assertThat(chat.chat(id).reads()).isEmpty();

        as(courier);
        chat.markRead(id, second.id());
        chat.markRead(id, first.id()); // an older message never moves it back
        chat.markRead(id, second.id()); // nor does reading the same one again
        assertThat(chat.chat(id).reads()).containsExactly(new ChatDto.Read(courier, second.sentAt()));
        var receipts = facts.events.stream()
                .filter(ErrandChatReadEvent.class::isInstance)
                .map(event -> ((ErrandChatReadEvent) event).payload())
                .toList();
        assertThat(receipts)
                .containsExactly(
                        new ErrandChatReadEvent.Payload(id, courier, List.of(requester, courier), second.sentAt()));

        as(UUID.randomUUID());
        assertThatThrownBy(() -> chat.markRead(id, second.id())).isInstanceOf(AccessDeniedException.class);
        as(courier);
        var other = open();
        assertThatThrownBy(() -> chat.markRead(other, second.id())).isInstanceOf(RuntimeException.class);
    }

    @Test
    void databaseRejectsInvalidBaseFields() {
        var id = open();
        assertThatThrownBy(() -> jdbc.update("UPDATE errands SET credit_reward=-1 WHERE id=?", id))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE errands SET courier_id=requester_id WHERE id=?", id))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE errands SET expires_at=created_at WHERE id=?", id))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(service.get(id).status().name()).isEqualTo("OPEN");
    }

    static class TestClock extends Clock {
        final AtomicReference<Instant> time = new AtomicReference<>(START);

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return Clock.fixed(instant(), zone);
        }

        @Override
        public Instant instant() {
            return time.get();
        }
    }

    static class Facts {
        final List<Object> events = new CopyOnWriteArrayList<>();

        @EventListener
        public void completed(ErrandCompletedEvent e) {
            events.add(e);
        }

        @EventListener
        public void cancelled(ErrandCancelledEvent e) {
            events.add(e);
        }

        @EventListener
        public void expired(ErrandExpiredEvent e) {
            events.add(e);
        }

        @EventListener
        public void messagePosted(ErrandMessagePostedEvent e) {
            events.add(e);
        }

        @EventListener
        public void chatRead(ErrandChatReadEvent e) {
            events.add(e);
        }
    }

    @TestConfiguration
    @EnableTransactionManagement
    @EnableConfigurationProperties(OrderProperties.class)
    @EnableJpaRepositories(basePackageClasses = ErrandRepository.class)
    @Import({
        OrderService.class,
        DeliveryService.class,
        ChatService.class,
        ChatVideoValidator.class,
        OrderDisputeService.class,
        CurrentUserService.class,
        AuthenticationContextService.class,
        AuthenticatedUserResolver.class
    })
    static class TestConfig {
        @Bean
        CreditClient creditClient() {
            return mock(CreditClient.class);
        }

        @Bean
        @Primary
        TestClock testClock() {
            return new TestClock();
        }

        @Bean
        Facts facts() {
            return new Facts();
        }

        @Bean
        SupplierClient supplierClient() {
            return mock(SupplierClient.class);
        }

        @Bean
        UserClient userClient() {
            return mock(UserClient.class);
        }

        @Bean
        DeliveryPhotoProcessor deliveryPhotoProcessor() {
            return mock(DeliveryPhotoProcessor.class);
        }

        @Bean
        DeliveryPhotoStorage deliveryPhotoStorage() {
            return mock(DeliveryPhotoStorage.class);
        }

        @Bean
        DeliveryPhotoStorageProperties deliveryPhotoStorageProperties() {
            return new DeliveryPhotoStorageProperties("foc-test-order", Duration.ofMinutes(10));
        }

        @Bean
        ErrandMapper mapper() {
            return Mappers.getMapper(ErrandMapper.class);
        }
    }
}
