package sg.edu.nus.foc.order.infrastructure;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import sg.edu.nus.foc.order.security.CourierSuspensionAuthority;
import sg.edu.nus.foc.order.domain.CourierAcceptanceDenied;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import sg.edu.nus.foc.order.application.recovery.*;
import sg.edu.nus.foc.order.adapter.MockPeerAdapters;
import sg.edu.nus.foc.order.api.dto.response.OrderResponse;
import sg.edu.nus.foc.order.application.OrderLifecycleScheduler;
import sg.edu.nus.foc.order.domain.OrderProblem;

/** F1/F3/F11/F13, ADR-033: real PostgreSQL commands; Credit is a contract stub. */
@SpringBootTest(properties = {"spring.profiles.active=local", "order.peers.mode=mock",
    "order.commands.enabled=true", "order.lifecycle.cron=-",
    "order.messaging.outbox.recovery-cron=-", "debug=false", "logging.level.root=WARN",
    "logging.level.org.hibernate.SQL=OFF"})
@Testcontainers
@AutoConfigureMockMvc
class OrderCommandRecoveryIntegrationTest {
    @Container static final PostgreSQLContainer<?> DB = new PostgreSQLContainer<>("postgres:15-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry p) {
        p.add("spring.datasource.url", DB::getJdbcUrl);
        p.add("spring.datasource.username", DB::getUsername);
        p.add("spring.datasource.password", DB::getPassword);
    }
    @Autowired OrderCommandService service;
    @Autowired OrderCommandStore store;
    @Autowired JdbcTemplate jdbc;
    @MockitoSpyBean MockPeerAdapters balances;
    @Autowired MockMvc mvc;
    @MockitoSpyBean LocalCreditCommandStub credit;
    @MockitoSpyBean sg.edu.nus.foc.order.application.OrderCreationService creation;
    @Autowired sg.edu.nus.foc.order.application.OrderTransitionService transitions;
    @Autowired sg.edu.nus.foc.order.application.LifecycleProcessingService lifecycle;
    @Autowired OrderLifecycleScheduler scheduler;
    @Autowired sg.edu.nus.foc.order.application.OrderCompletionHoldService reportHolds;

    CommandRequest create(String actor) {
        return new CommandRequest("CREATE", actor, null, 0,
            new CommandRequest.Creation("test", "pickup", "delivery", 5, 15,
                Instant.now().plusSeconds(7200), false, null, 0, 0, null));
    }
    String key() { return UUID.randomUUID().toString(); }
    void due(String k) { jdbc.update("update order_commands set next_retry_at=clock_timestamp()-interval '1 second', owner=null, lease_expires_at=null where command_id=?", k); }

    @Test void suspendedAcceptanceReturns403WithoutSavingOrGuardingTheOrder() throws Exception {
        OrderResponse opened = service.submit(key(), create(key()), null).result();
        String courier = key();
        for (String prefix : new String[] {"/api/orders/", "/api/orders/commands/"}) {
            String commandId = key();
            mvc.perform(post(prefix + opened.getId() + "/accept")
                    .with(jwt().jwt(token -> token.subject(courier)).authorities(new SimpleGrantedAuthority("ROLE_COURIER"), new CourierSuspensionAuthority(true)))
                    .contentType(MediaType.APPLICATION_JSON).content("{\"commandId\":\"" + commandId + "\",\"actorId\":\"" + courier + "\",\"expectedVersion\":0}"))
                    .andExpect(status().isForbidden()).andExpect(jsonPath("message").value(new CourierAcceptanceDenied().getMessage()));
            assertTrue(store.find(commandId).isEmpty());
            mvc.perform(get("/api/orders/commands/" + commandId).param("userId", courier)
                    .with(jwt().jwt(token -> token.subject(courier)).authorities(new SimpleGrantedAuthority("ROLE_COURIER"))))
                    .andExpect(status().isNotFound());
            verify(credit, never()).execute(eq(commandId), any(), anyLong(), nullable(String.class));
        }
        assertEquals("OPEN", jdbc.queryForObject("select status from orders where id=?", String.class, opened.getId()));
        assertEquals("CANCELLED", transitions.cancel(key(), opened.getId(), opened.getRequesterId(), opened.getVersion(), null).getStatus().name());
    }

    @Test void suspendedAssignedCourierCanDeliverWhileHeldButOtherCouriersCannot() throws Exception {
        OrderResponse opened = service.submit(key(), create(key()), null).result();
        String courier = key();
        OrderResponse accepted = service.submit(key(), new CommandRequest("ACCEPT", courier, opened.getId(), opened.getVersion(), null), null).result();
        jdbc.update("update orders set completion_hold=true where id=?", opened.getId());
        clearInvocations(balances);
        String other = key();
        mvc.perform(post("/api/orders/" + opened.getId() + "/start")
                .with(jwt().jwt(token -> token.subject(other)).authorities(new SimpleGrantedAuthority("ROLE_COURIER"), new CourierSuspensionAuthority(true)))
                .contentType(MediaType.APPLICATION_JSON).content("{\"commandId\":\"" + key() + "\",\"actorId\":\"" + other + "\",\"expectedVersion\":" + accepted.getVersion() + "}"))
                .andExpect(status().isForbidden());
        String[] actions = {"start", "pickup", "deliver"};
        String[] states = {"IN_PROGRESS", "PICKED_UP", "DELIVERED"};
        for (int index = 0; index < actions.length; index++) {
            long version = jdbc.queryForObject("select version from orders where id=?", Long.class, opened.getId());
            mvc.perform(post("/api/orders/" + opened.getId() + "/" + actions[index])
                    .with(jwt().jwt(token -> token.subject(courier)).authorities(new SimpleGrantedAuthority("ROLE_COURIER"), new CourierSuspensionAuthority(true)))
                    .contentType(MediaType.APPLICATION_JSON).content("{\"commandId\":\"" + key() + "\",\"actorId\":\"" + courier + "\",\"expectedVersion\":" + version + "}"))
                    .andExpect(status().isOk()).andExpect(jsonPath("status").value(states[index]));
        }
        verify(balances, never()).requireCourierAcceptance(anyString(), nullable(String.class));
        long version = jdbc.queryForObject("select version from orders where id=?", Long.class, opened.getId());
        assertEquals("COMPLETION_ON_HOLD", assertThrows(OrderProblem.class,
                () -> transitions.complete(key(), opened.getId(), opened.getRequesterId(), version, null)).getCode());
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"RETRY", "COMPENSATE"})
    void suspendedNoEffectRecoveryFinishesRejectedWithoutCallingCredit(String policy) {
        OrderResponse opened = service.submit(key(), create(key()), null).result();
        String courier = key();
        String commandId = key();
        store.register(commandId, new CommandRequest("ACCEPT", courier, opened.getId(), opened.getVersion(), null), policy, 120);
        doThrow(new CourierAcceptanceDenied()).when(balances).requireCourierAcceptance(eq(courier), nullable(String.class));
        CommandView result = service.resume(commandId, courier, null);
        assertEquals("COMPLETED", result.status());
        assertEquals("REJECTED", result.outcome());
        assertEquals(new CourierAcceptanceDenied().getMessage(), result.message());
        assertFalse(store.get(commandId).possibleEffect());
        verify(credit, never()).execute(eq(commandId), any(), anyLong(), nullable(String.class));
        verify(credit, never()).compensate(eq(commandId), any(), anyLong(), nullable(String.class));
        assertEquals("CANCELLED", transitions.cancel(key(), opened.getId(), opened.getRequesterId(), opened.getVersion(), null).getStatus().name());
    }

    @Test void suspendedUncertainAcceptanceWaitsForConfirmedReversalBeforeRejecting() {
        OrderResponse opened = service.submit(key(), create(key()), null).result();
        String courier = key();
        String commandId = key();
        doAnswer(call -> { call.callRealMethod(); throw new IllegalStateException("lost Credit reply"); })
                .when(credit).execute(eq(commandId), any(), anyLong(), nullable(String.class));
        assertEquals("PENDING", service.submit(commandId, new CommandRequest("ACCEPT", courier, opened.getId(), opened.getVersion(), null), null).status());
        assertTrue(store.get(commandId).possibleEffect());
        doThrow(new CourierAcceptanceDenied()).when(balances).requireCourierAcceptance(eq(courier), nullable(String.class));
        doReturn(false).doThrow(new IllegalStateException("reversal unavailable")).doCallRealMethod()
                .when(credit).compensate(eq(commandId), any(), anyLong(), nullable(String.class));
        for (int attempt = 0; attempt < 2; attempt++) {
            CommandView waiting = service.resume(commandId, courier, null);
            assertEquals("PENDING", waiting.status());
            assertEquals("RECONCILIATION_REQUIRED", waiting.reason());
        }
        CommandView rejected = service.resume(commandId, courier, null);
        assertEquals("REJECTED", rejected.outcome());
        assertNull(balances.reservationCourier(opened.getId()));
        assertEquals("OPEN", jdbc.queryForObject("select status from orders where id=?", String.class, opened.getId()));
        verify(credit, times(1)).execute(eq(commandId), any(), anyLong(), nullable(String.class));
    }

    @Test void suspensionAfterCreditSuccessReadsThePersistedEffectBarrierBeforeRejection() {
        OrderResponse opened = service.submit(key(), create(key()), null).result();
        String courier = key();
        String commandId = key();
        doNothing().doNothing().doThrow(new CourierAcceptanceDenied()).when(balances)
                .requireCourierAcceptance(eq(courier), nullable(String.class));
        CommandView rejected = service.submit(commandId, new CommandRequest("ACCEPT", courier, opened.getId(), opened.getVersion(), null), null);
        assertEquals("REJECTED", rejected.outcome());
        verify(credit).compensate(eq(commandId), any(), anyLong(), nullable(String.class));
        assertNull(balances.reservationCourier(opened.getId()));
        assertEquals("OPEN", jdbc.queryForObject("select status from orders where id=?", String.class, opened.getId()));
    }

    @Test void alreadySuccessfulAcceptanceReplaysAfterSuspension() {
        OrderResponse opened = service.submit(key(), create(key()), null).result();
        String courier = key();
        String commandId = key();
        CommandRequest input = new CommandRequest("ACCEPT", courier, opened.getId(), opened.getVersion(), null);
        CommandView completed = service.submit(commandId, input, null);
        doThrow(new CourierAcceptanceDenied()).when(balances).requireCourierAcceptance(eq(courier), nullable(String.class));
        CommandView replayed = service.submit(commandId, input, null);
        tools.jackson.databind.json.JsonMapper json = tools.jackson.databind.json.JsonMapper.builder().build();
        assertEquals(json.writeValueAsString(completed), json.writeValueAsString(replayed));
        verify(credit, times(1)).execute(eq(commandId), any(), anyLong(), nullable(String.class));
    }

    @Test void reportPlacementVersionChangeDoesNotHideTheHoldFromAStaleCourier() {
        String requester = key();
        String courier = key();
        OrderResponse created = service.submit(key(), create(requester), null).result();
        OrderResponse accepted = service.submit(key(), new CommandRequest("ACCEPT", courier,
                created.getId(), created.getVersion(), null), null).result();
        reportHolds.placeActive(accepted.getId(), key(), requester, true, null);
        assertTrue(jdbc.queryForObject("select version from orders where id=?", Long.class, accepted.getId()) > accepted.getVersion());
        String commandId = key();
        CommandView rejected = service.submit(commandId, new CommandRequest("ABORT", courier,
                accepted.getId(), accepted.getVersion(), null), null);
        assertEquals("REJECTED", rejected.outcome());
        assertEquals("ORDER_ON_HOLD", rejected.reason());
        assertEquals("This order has an active report. Please resolve it before proceeding.", rejected.message());
        verify(credit, never()).execute(eq(commandId), any(), anyLong(), nullable(String.class));
        assertEquals("ACCEPTED", jdbc.queryForObject("select status from orders where id=?", String.class, accepted.getId()));
    }

    @Test void heldAbortKeepsTheBusinessExplanationInRetryModeAndTerminalReplay() {
        CommandView created = service.submit(key(), create(key()), null);
        String courier = key();
        CommandView accepted = service.submit(key(), new CommandRequest("ACCEPT", courier,
                created.result().getId(), created.result().getVersion(), null), null);
        String orderId = accepted.result().getId();
        jdbc.update("update orders set completion_hold=true where id=?", orderId);
        String commandId = key();
        CommandRequest abort = new CommandRequest("ABORT", courier, orderId,
                accepted.result().getVersion(), null);

        CommandView result = service.submit(commandId, abort, null);
        assertEquals("REJECTED", result.outcome());
        assertEquals("ORDER_ON_HOLD", result.reason());
        assertEquals("This order has an active report. Please resolve it before proceeding.", result.message());
        assertEquals(result, service.submit(commandId, abort, null));
        assertFalse(jdbc.queryForObject("select possible_effect from order_commands where command_id=?", Boolean.class, commandId));
        verify(credit, never()).execute(eq(commandId), any(), anyLong(), nullable(String.class));
        verify(credit, never()).compensate(eq(commandId), any(), anyLong(), nullable(String.class));
        assertEquals("ACCEPTED", jdbc.queryForObject("select status from orders where id=?", String.class, orderId));
        assertEquals(0, jdbc.queryForObject("select count(*) from order_event_outbox where command_id=?", Integer.class, commandId));
    }

    @Test void savedPendingProjectionSurvivesLostResponsesAndUsesCommittedTargetOrFrozenInput() {
        String createKey = key(), requester = key();
        var input = create(requester);
        store.register(createKey, input);
        var creationView = service.status(createKey, requester, null);
        assertEquals("test", creationView.displayDetails().itemDescription());
        assertNull(creationView.displayDetails().orderStatus());
        assertFalse(creationView.orderId().isBlank());
        assertEquals(0, jdbc.queryForObject("select count(*) from orders where id=?", Integer.class, creationView.orderId()));

        var opened = service.submit(key(), create(key()), null).result();
        String courier = key(), acceptKey = key();
        doAnswer(call -> { call.callRealMethod(); throw new IllegalStateException("lost response"); })
            .doCallRealMethod().when(credit).execute(eq(acceptKey), any(), anyLong(), nullable(String.class));
        var pending = service.submit(acceptKey, new CommandRequest("ACCEPT", courier, opened.getId(), opened.getVersion(), null), null);
        assertEquals("PENDING", pending.status());
        jdbc.update("update orders set expires_at=clock_timestamp()-interval '1 second' where id=?", opened.getId());
        var discovered = service.pending(courier, null, 1, 100).stream().filter(view -> acceptKey.equals(view.commandId())).findFirst().orElseThrow();
        assertEquals(opened.getId(), discovered.orderId());
        assertEquals("OPEN", discovered.displayDetails().orderStatus());
        assertEquals(opened.getItemDescription(), discovered.displayDetails().itemDescription());
        assertThrows(OrderProblem.class, () -> service.status(acceptKey, requester, null));
        due(acceptKey);
        service.recoverDue();
        var terminal = service.status(acceptKey, courier, null);
        assertEquals("REJECTED", terminal.outcome());
        assertNull(terminal.displayDetails());
    }

    OrderResponse expiredOriginal(String actor) {
        OrderResponse opened = service.submit(key(), create(actor), null).result();
        jdbc.update("update orders set expires_at=clock_timestamp()-interval '1 second' where id=?", opened.getId());
        lifecycle.expireDue(Instant.now());
        return service.status(jdbc.queryForObject("select command_id from order_commands where order_id=?", String.class, opened.getId()), actor, null).result();
    }

    CommandRequest repost(OrderResponse original, Instant expiry) {
        long version = jdbc.queryForObject("select version from orders where id=?", Long.class, original.getId());
        return new CommandRequest("REPOST", original.getRequesterId(), original.getId(), version,
                new CommandRequest.Creation("reposted task", "pickup", "delivery", 5, 15,
                        expiry, false, null, 0, 0, null));
    }

    @Test void manualRepostCommitsOneCandidateAndHidesOnlySuccessfullyLinkedOriginal() {
        OrderResponse original = expiredOriginal(key());
        String k = key();
        CommandRequest request = repost(original, Instant.now().plusSeconds(7200));
        doAnswer(call -> {
            assertEquals(original.getId(), store.get(k).orderId());
            assertEquals("PENDING", store.get(k).status());
            assertNotNull(jdbc.queryForObject("select candidate_order_id from order_commands where command_id=?", String.class, k));
            return call.callRealMethod();
        }).when(credit).execute(eq(k), any(), anyLong(), nullable(String.class));
        CommandView completed = service.submit(k, request, null);
        assertEquals("SUCCESS", completed.outcome());
        String candidate = completed.result().getId();
        assertNotEquals(original.getId(), candidate);
        assertEquals(candidate, jdbc.queryForObject("select candidate_order_id from order_commands where command_id=?", String.class, k));
        assertEquals(candidate, jdbc.queryForObject("select reposted_order_id from orders where id=?", String.class, original.getId()));
        assertEquals(original.getId(), completed.result().getOriginalOrderId());
        assertEquals(candidate, service.submit(k, request, null).result().getId());
        verify(credit, times(1)).execute(eq(k), any(), anyLong(), nullable(String.class));
        assertEquals(1, jdbc.queryForObject("select count(*) from orders where original_order_id=?", Integer.class, original.getId()));
        assertEquals(1, jdbc.queryForObject("select count(*) from order_event_outbox where order_id=?", Integer.class, original.getId()));
    }

    @Test void manualRepostLostReplyGuardsOriginalAndRecoversTheSameCandidate() {
        OrderResponse original = expiredOriginal(key());
        String k = key();
        CommandRequest request = repost(original, Instant.now().plusSeconds(7200));
        doAnswer(call -> { call.callRealMethod(); throw new IllegalStateException("lost response"); })
                .doCallRealMethod().when(credit).execute(eq(k), any(), anyLong(), nullable(String.class));
        CommandView pending = service.submit(k, request, null);
        assertEquals("PENDING", pending.status());
        String candidate = jdbc.queryForObject("select candidate_order_id from order_commands where command_id=?", String.class, k);
        assertNull(jdbc.queryForObject("select reposted_order_id from orders where id=?", String.class, original.getId()));
        assertThrows(OrderProblem.class, () -> service.submit(key(), request, null));
        due(k);
        service.recoverDue();
        assertEquals("SUCCESS", store.get(k).outcome());
        assertEquals(candidate, store.get(k).result().getId());
        assertEquals(10, balances.creditSnapshot(original.getRequesterId()).getReserved());
    }

    @Test void manualRepostInitialWindowRejectionPersistsSafeMessageWithoutCredit() {
        OrderResponse original = expiredOriginal(key());
        String k = key();
        CommandView rejected = service.submit(k, repost(original, Instant.now().plusSeconds(1799)), null);
        assertEquals("REJECTED", rejected.outcome());
        assertEquals("VALIDATION_ERROR", rejected.reason());
        verify(credit, never()).execute(eq(k), any(), anyLong(), nullable(String.class));
        assertEquals(rejected.message(), jdbc.queryForObject("select repost_failure_message from orders where id=?", String.class, original.getId()));
        assertEquals("EXPIRED", jdbc.queryForObject("select status from orders where id=?", String.class, original.getId()));
    }

    @Test void manualRepostConcurrentSameKeyAndDifferentKeysCannotCreateTwoSuccessors() throws Exception {
        OrderResponse original = expiredOriginal(key());
        CommandRequest request = repost(original, Instant.now().plusSeconds(7200));
        String k = key();
        CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
        doAnswer(call -> { entered.countDown(); assertTrue(release.await(10, TimeUnit.SECONDS)); return call.callRealMethod(); })
                .when(credit).execute(eq(k), any(), anyLong(), nullable(String.class));
        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            Future<CommandView> first = pool.submit(() -> service.submit(k, request, null));
            assertTrue(entered.await(10, TimeUnit.SECONDS));
            try {
                assertEquals("PENDING", service.submit(k, request, null).status());
                assertThrows(OrderProblem.class, () -> service.submit(key(), request, null));
            } finally { release.countDown(); }
            assertEquals("SUCCESS", first.get(10, TimeUnit.SECONDS).outcome());
        }
        verify(credit, times(1)).execute(eq(k), any(), anyLong(), nullable(String.class));
    }

    @Test void manualRepostOwnerInputBindingAndFrozenSupplierReferencesAreAuthoritative() {
        OrderResponse original = expiredOriginal(key());
        CommandRequest valid = repost(original, Instant.now().plusSeconds(7200));
        String foreignKey = key();
        assertThrows(OrderProblem.class, () -> service.submit(foreignKey,
                new CommandRequest("REPOST", key(), original.getId(), valid.expectedVersion(), valid.creation()), null));
        assertTrue(store.find(foreignKey).isEmpty());
        String k = key();
        CommandRequest.Creation tampered = new CommandRequest.Creation("reposted task", "forged-p", "forged-d", 5, 15,
                valid.creation().expiresAt(), false, null, 0, 0, null);
        CommandView success = service.submit(k, new CommandRequest("REPOST", valid.actorId(), valid.orderId(), valid.expectedVersion(), tampered), null);
        assertEquals("pickup", store.get(k).input().creation().pickup());
        assertEquals("delivery", success.result().getDeliverySupplierId());
        assertThrows(OrderProblem.class, () -> service.submit(k,
                new CommandRequest("REPOST", valid.actorId(), valid.orderId(), valid.expectedVersion(),
                        new CommandRequest.Creation("changed", "pickup", "delivery", 6, 15, valid.creation().expiresAt(), false, null, 0, 0, null)), null));
    }

    @Test void creationIsDurableBeforeCreditAndTerminalReplayDoesNotReserveTwice() {
        String k = key(), actor = key();
        doAnswer(call -> {
            assertEquals("PENDING", store.get(k).status());
            assertNotNull(store.get(k).owner());
            assertEquals(0, jdbc.queryForObject("select count(*) from orders where id=?", Integer.class, store.get(k).orderId()));
            return call.callRealMethod();
        }).when(credit).execute(eq(k), any(), anyLong(), nullable(String.class));
        CommandRequest input = create(actor);
        var result = service.submit(k, input, null);
        assertEquals("SUCCESS", result.outcome());
        assertEquals("OPEN", result.result().getStatus());
        assertEquals(result.orderId(), service.submit(k, input, null).orderId());
        assertEquals(5, balances.creditSnapshot(actor).getReserved());
        assertEquals(1, result.attemptCount());
    }

    @Test void immutableInputAndAccountBindingRejectKeyReuse() {
        String k = key(); var input = create(key());
        service.submit(k, input, null);
        assertThrows(OrderProblem.class, () -> service.submit(k, create(key()), null));
        assertThrows(OrderProblem.class, () -> service.status(k, "other", null));
        var changed = new CommandRequest("ACCEPT", input.actorId(), key(), 0, null);
        assertThrows(OrderProblem.class, () -> service.submit(k, changed, null));
    }

    @Test void lostCreditResponseReplaysSameCandidateAndFinishesOnce() {
        String k = key(), actor = key(); var input = create(actor);
        doAnswer(call -> { call.callRealMethod(); throw new IllegalStateException("lost response"); })
            .doCallRealMethod().when(credit).execute(eq(k), any(), anyLong(), nullable(String.class));
        var pending = service.submit(k, input, null);
        assertEquals("PENDING", pending.status());
        assertNull(pending.result());
        assertEquals(5, balances.creditSnapshot(actor).getReserved());
        due(k);
        var success = service.resume(k, actor, null);
        assertEquals("SUCCESS", success.outcome());
        assertEquals(pending.orderId(), success.orderId());
        assertEquals(5, balances.creditSnapshot(actor).getReserved());
    }

    @Test void laterAuthorizationFailureDoesNotResolveEarlierTimeout() {
        String k = key(), actor = key();
        doAnswer(call -> { call.callRealMethod(); throw new IllegalStateException("lost response"); })
            .doThrow(new OrderProblem("UNAUTHENTICATED", "expired"))
            .doCallRealMethod().when(credit).execute(eq(k), any(), anyLong(), nullable(String.class));
        service.submit(k, create(actor), null); due(k);
        assertEquals("AUTHORIZATION_REQUIRED", service.resume(k, actor, null).reason());
        assertEquals("PENDING", store.get(k).status());
        due(k);
        assertEquals("SUCCESS", service.resume(k, actor, "fresh token").outcome());
    }

    @Test void concurrentSameKeyHasOneClaimAndOneRemoteEffect() throws Exception {
        String k = key(), actor = key(); var input = create(actor);
        CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
        doAnswer(call -> { entered.countDown(); assertTrue(release.await(10, TimeUnit.SECONDS)); return call.callRealMethod(); })
            .when(credit).execute(eq(k), any(), anyLong(), nullable(String.class));
        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            Future<CommandView> first = pool.submit(() -> service.submit(k, input, null));
            assertTrue(entered.await(10, TimeUnit.SECONDS));
            try { assertEquals("PENDING", service.submit(k, input, null).status()); }
            finally { release.countDown(); }
            assertEquals("SUCCESS", first.get(10, TimeUnit.SECONDS).outcome());
        }
        verify(credit, times(1)).execute(eq(k), any(), anyLong(), nullable(String.class));
        assertEquals(5, balances.creditSnapshot(actor).getReserved());
    }

    @Test void acceptanceAndAbortUseCurrentOrderAndKeepOneHistoryAttempt() {
        var opened = service.submit(key(), create(key()), null).result();
        String courier = key();
        var accepted = service.submit(key(), new CommandRequest("ACCEPT", courier, opened.getId(), opened.getVersion(), null), null).result();
        assertEquals("ACCEPTED", accepted.getStatus());
        String abortKey = key();
        var aborted = service.submit(abortKey, new CommandRequest("ABORT", courier, accepted.getId(), accepted.getVersion(), null), null);
        assertEquals("OPEN", aborted.result().getStatus());
        assertEquals(opened.getId(), aborted.orderId());
        assertNull(balances.reservationCourier(opened.getId()));
        assertEquals(1, jdbc.queryForObject("select count(*) from order_courier_attempts where order_id=?", Integer.class, opened.getId()));
    }

    @Test void oldWorkerCannotCompleteAfterLeaseTakeover() {
        String k = key(); store.register(k, create(key()));
        var first = store.claim(k, "first", 120, false).orElseThrow();
        assertTrue(store.claim(k, "second", 120, false).isEmpty());
        jdbc.update("update order_commands set lease_expires_at=clock_timestamp()-interval '1 second' where command_id=?", k);
        var second = store.claim(k, "second", 120, false).orElseThrow();
        assertTrue(second.generation() > first.generation());
        assertThrows(OrderProblem.class, () -> store.assertOwned(first));
        store.assertOwned(second);
    }

    @Test void localBusinessRollbackLeavesDurableCommandForForwardRecovery() {
        String k = key(), actor = key();
        doAnswer(call -> { call.callRealMethod(); throw new IllegalStateException("crash before local commit"); })
            .doCallRealMethod().when(creation).createConfirmed(eq(k), anyString(), eq(actor), anyString(),
                anyString(), anyString(), anyLong(), anyInt(), any(), nullable(sg.edu.nus.foc.order.domain.RepostPlan.class), nullable(String.class));
        var pending = service.submit(k, create(actor), null);
        assertEquals("PENDING", pending.status());
        assertEquals(0, jdbc.queryForObject("select count(*) from orders where id=?", Integer.class, pending.orderId()));
        assertEquals(5, balances.creditSnapshot(actor).getReserved());
        due(k); service.recoverDue();
        assertEquals("SUCCESS", store.get(k).outcome());
        assertEquals(5, balances.creditSnapshot(actor).getReserved());
    }

    @Test void insufficientFundsIsAnAuthoritativeTerminalRejection() {
        String actor = key();
        balances.reserve(key(), actor, 49, null);
        var rejected = service.submit(key(), create(actor), null);
        assertEquals("REJECTED", rejected.outcome());
        assertEquals("INSUFFICIENT_CREDITS", rejected.reason());
        assertNull(rejected.result());
        assertEquals(0, jdbc.queryForObject("select count(*) from orders where id=?", Integer.class, rejected.orderId()));
    }

    @Test void invalidDetailsStopBeforeAnyCreditWrite() {
        String k = key(), actor = key();
        var invalid = new CommandRequest("CREATE", actor, null, 0,
            new CommandRequest.Creation("bad", "same", "same", 5, 15, Instant.now().plusSeconds(7200), false, null, 0, 0, null));
        assertEquals("REJECTED", service.submit(k, invalid, null).outcome());
        verify(credit, never()).execute(eq(k), any(), anyLong(), nullable(String.class));
    }

    @Test void expiredRemoteAcceptanceIsCompensatedNotSilentlyAccepted() {
        var opened = service.submit(key(), create(key()), null).result();
        String k = key(), courier = key();
        doAnswer(call -> {
            Object result = call.callRealMethod();
            jdbc.update("update orders set expires_at=clock_timestamp()-interval '1 second' where id=?", opened.getId());
            return result;
        }).when(credit).execute(eq(k), any(), anyLong(), nullable(String.class));
        var result = service.submit(k, new CommandRequest("ACCEPT", courier, opened.getId(), opened.getVersion(), null), null);
        assertEquals("REJECTED", result.outcome());
        assertNull(balances.reservationCourier(opened.getId()));
        assertEquals("OPEN", jdbc.queryForObject("select status from orders where id=?", String.class, opened.getId()));
    }

    @Test void unresolvedAcceptanceGuardsOtherKeysCancellationAndExpiry() {
        var opened = service.submit(key(), create(key()), null).result();
        String k = key(), courier = key();
        doAnswer(call -> { call.callRealMethod(); throw new IllegalStateException("response lost"); })
            .when(credit).execute(eq(k), any(), anyLong(), nullable(String.class));
        service.submit(k, new CommandRequest("ACCEPT", courier, opened.getId(), opened.getVersion(), null), null);
        assertThrows(OrderProblem.class, () -> service.submit(key(), new CommandRequest("ACCEPT", key(), opened.getId(), opened.getVersion(), null), null));
        assertThrows(OrderProblem.class, () -> transitions.cancel(key(), opened.getId(), opened.getRequesterId(), opened.getVersion(), null));
        jdbc.update("update orders set expires_at=clock_timestamp()-interval '1 second' where id=?", opened.getId());
        lifecycle.expireDue(Instant.now());
        assertEquals("OPEN", jdbc.queryForObject("select status from orders where id=?", String.class, opened.getId()));
        assertEquals(0, jdbc.queryForObject("select count(*) from order_event_outbox where order_id=?", Integer.class, opened.getId()));
    }

    @Test
    void mergedTickResolvesValidAcceptanceWithoutExpiringTheAcceptedOrder() {
        OrderResponse opened = service.submit(key(), create(key()), null).result();
        String acceptanceKey = key();
        String courier = key();
        doAnswer(call -> {
            call.callRealMethod();
            throw new IllegalStateException("response lost");
        }).doCallRealMethod().when(credit).execute(eq(acceptanceKey), any(), anyLong(), nullable(String.class));
        CommandView pending = service.submit(acceptanceKey,
                new CommandRequest("ACCEPT", courier, opened.getId(), opened.getVersion(), null), null);
        assertEquals("PENDING", pending.status());
        due(acceptanceKey);

        scheduler.processDueOrders();

        assertEquals("SUCCESS", store.get(acceptanceKey).outcome());
        assertEquals("ACCEPTED", jdbc.queryForObject(
                "select status from orders where id=?", String.class, opened.getId()));
        assertEquals(courier, balances.reservationCourier(opened.getId()));
        jdbc.update("update orders set expires_at=clock_timestamp()-interval '1 second' where id=?", opened.getId());
        scheduler.processDueOrders();
        assertEquals("ACCEPTED", jdbc.queryForObject(
                "select status from orders where id=?", String.class, opened.getId()));
        assertEquals(0, jdbc.queryForObject(
                "select count(*) from order_event_outbox where order_id=?", Integer.class, opened.getId()));
    }

    @Test
    void mergedTickCompensatesExpiredAcceptanceBeforeQueuingOneRefund() {
        OrderResponse opened = service.submit(key(), create(key()), null).result();
        String acceptanceKey = key();
        doAnswer(call -> {
            call.callRealMethod();
            throw new IllegalStateException("response lost");
        }).when(credit).execute(eq(acceptanceKey), any(), anyLong(), nullable(String.class));
        service.submit(acceptanceKey,
                new CommandRequest("ACCEPT", key(), opened.getId(), opened.getVersion(), null), null);
        jdbc.update("update orders set expires_at=clock_timestamp()-interval '1 second' where id=?", opened.getId());
        due(acceptanceKey);

        scheduler.processDueOrders();

        assertEquals("COMPLETED", store.get(acceptanceKey).status());
        assertEquals("REJECTED", store.get(acceptanceKey).outcome());
        assertNull(balances.reservationCourier(opened.getId()));
        assertEquals("EXPIRED", jdbc.queryForObject(
                "select status from orders where id=?", String.class, opened.getId()));
        verify(credit, times(1)).compensate(eq(acceptanceKey), any(), anyLong(), nullable(String.class));
        assertEquals(1, jdbc.queryForObject(
                "select count(*) from order_event_outbox where order_id=? and event_type='OpenOrderRefundTaskEvent'",
                Integer.class, opened.getId()));

        scheduler.processDueOrders();
        assertEquals(1, jdbc.queryForObject(
                "select count(*) from order_event_outbox where order_id=?", Integer.class, opened.getId()));
    }

    @Test
    void mergedTickKeepsExpiryBlockedUntilCompensationIsConfirmed() {
        OrderResponse opened = service.submit(key(), create(key()), null).result();
        String acceptanceKey = key();
        String courier = key();
        doAnswer(call -> {
            call.callRealMethod();
            throw new IllegalStateException("response lost");
        }).when(credit).execute(eq(acceptanceKey), any(), anyLong(), nullable(String.class));
        doReturn(false).when(credit).compensate(eq(acceptanceKey), any(), anyLong(), nullable(String.class));
        service.submit(acceptanceKey,
                new CommandRequest("ACCEPT", courier, opened.getId(), opened.getVersion(), null), null);
        jdbc.update("update orders set expires_at=clock_timestamp()-interval '1 second' where id=?", opened.getId());
        due(acceptanceKey);

        scheduler.processDueOrders();

        assertEquals("PENDING", store.get(acceptanceKey).status());
        assertEquals("RECONCILIATION_REQUIRED", store.get(acceptanceKey).reason());
        assertEquals("OPEN", jdbc.queryForObject(
                "select status from orders where id=?", String.class, opened.getId()));
        assertEquals(courier, balances.reservationCourier(opened.getId()));
        assertEquals(0, jdbc.queryForObject(
                "select count(*) from order_event_outbox where order_id=?", Integer.class, opened.getId()));

        doCallRealMethod().when(credit).compensate(eq(acceptanceKey), any(), anyLong(), nullable(String.class));
        due(acceptanceKey);
        scheduler.processDueOrders();
        assertEquals("REJECTED", store.get(acceptanceKey).outcome());
        assertEquals("EXPIRED", jdbc.queryForObject(
                "select status from orders where id=?", String.class, opened.getId()));
    }

    @Test void unresolvedAbortGuardsStartAndDoesNotCreateHistoryPrematurely() {
        var opened = service.submit(key(), create(key()), null).result(); String courier = key();
        var accepted = service.submit(key(), new CommandRequest("ACCEPT", courier, opened.getId(), opened.getVersion(), null), null).result();
        String k = key();
        doAnswer(call -> { call.callRealMethod(); throw new IllegalStateException("response lost"); })
            .doCallRealMethod().when(credit).execute(eq(k), any(), anyLong(), nullable(String.class));
        var pending = service.submit(k, new CommandRequest("ABORT", courier, accepted.getId(), accepted.getVersion(), null), null);
        assertEquals("PENDING", pending.status());
        assertThrows(OrderProblem.class, () -> transitions.start(key(), accepted.getId(), courier, accepted.getVersion(), null));
        assertEquals(0, jdbc.queryForObject("select count(*) from order_courier_attempts where order_id=?", Integer.class, accepted.getId()));
        due(k); service.recoverDue();
        assertEquals("SUCCESS", store.get(k).outcome());
    }
}
