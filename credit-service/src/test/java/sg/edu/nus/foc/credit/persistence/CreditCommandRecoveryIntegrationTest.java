/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-11
 * Mode: Test generation.
 * Scope: Generated integration tests to test order command idempotency based on the defined scenarios.
 * Author review: I reviewed for correctness and edited where needed.
 */

package sg.edu.nus.foc.credit.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.CountDownLatch;
import javax.sql.DataSource;
import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import sg.edu.nus.foc.credit.api.CourierAssignmentRequest;
import sg.edu.nus.foc.credit.CreditServiceApplication;
import sg.edu.nus.foc.credit.api.ReserveCreditsRequest;
import sg.edu.nus.foc.credit.credit.CommandMutationResult;
import sg.edu.nus.foc.credit.credit.CreditCommandOperation;
import sg.edu.nus.foc.credit.credit.CreditCommandOutcome;
import sg.edu.nus.foc.credit.credit.CreditCommandService;
import sg.edu.nus.foc.credit.credit.ReservationResult;
import sg.edu.nus.foc.credit.error.CreditCommandException;
import sg.edu.nus.foc.credit.messaging.UserCreatedEventHandler;
import sg.edu.nus.foc.credit.messaging.UserCreatedEventMessage;
import sg.edu.nus.foc.credit.support.PostgreSqlTestContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest
@AutoConfigureMockMvc
class CreditCommandRecoveryIntegrationTest {

    private static final String REQUESTER = "requester-recovery";
    private static final String COURIER = "courier-recovery";
    private static final String OTHER = "other-recovery";

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        PostgreSqlTestContainer.register(registry);
    }

    @Autowired MockMvc mvc;
    @Autowired JsonMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @Autowired CreditCommandService commands;
    @Autowired CreditCommandStore store;
    @Autowired UserCreatedEventHandler userCreatedEvents;
    @Autowired DataSource dataSource;

    @MockitoSpyBean CreditLedgerJpaRepository ledgerRepository;
    @MockitoSpyBean CreditCommandJpaRepository commandRepository;

    @BeforeEach
    void reset() {
        jdbc.execute("truncate table credit_ledger, credit_reservations, "
                + "credit_idempotency_records, credit_command_records, credit_accounts cascade");
    }

    @Test
    void recoveryHeadersAreOptInValidatedAndLegacyBehaviorIsPreserved() throws Exception {
        register(REQUESTER);
        byte[] body = reserveBody(REQUESTER, 7);

        mvc.perform(put("/api/credits/orders/legacy-order/reservation")
                        .with(userJwt(REQUESTER)).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(header().doesNotExist("Command-Outcome"));

        assertValidation(put("/api/credits/orders/partial-key/reservation")
                .with(userJwt(REQUESTER)).header("Idempotency-Key", "partial-key")
                .contentType(MediaType.APPLICATION_JSON).content(body));
        assertValidation(put("/api/credits/orders/partial-generation/reservation")
                .with(userJwt(REQUESTER)).header("X-Command-Generation", "1")
                .contentType(MediaType.APPLICATION_JSON).content(body));
        for (String generation : List.of("zero", "0", "-1")) {
            assertValidation(put("/api/credits/orders/bad-generation-" + generation.replace('-', 'n')
                            + "/reservation")
                    .with(userJwt(REQUESTER)).header("Idempotency-Key", "valid-key-" + generation)
                    .header("X-Command-Generation", generation)
                    .contentType(MediaType.APPLICATION_JSON).content(body));
        }
        assertValidation(put("/api/credits/orders/blank-key/reservation")
                .with(userJwt(REQUESTER)).header("Idempotency-Key", " ")
                .header("X-Command-Generation", "1")
                .contentType(MediaType.APPLICATION_JSON).content(body));
        assertValidation(put("/api/credits/orders/large-key/reservation")
                .with(userJwt(REQUESTER)).header("Idempotency-Key", "x".repeat(129))
                .header("X-Command-Generation", "1")
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test
    void reserveCommitsOneEffectAndReplaysItsSavedResponse() throws Exception {
        register(REQUESTER);
        String key = "reserve-command-1";

        MvcResult applied = reserve(key, 1, "order-reserve", REQUESTER, 17)
                .andExpect(status().isCreated())
                .andExpect(header().string("Idempotency-Key", key))
                .andExpect(header().string("Command-Outcome", "APPLIED"))
                .andExpect(jsonPath("$.status").value("RESERVED"))
                .andExpect(jsonPath("$.balance.reservedBalance").value(17))
                .andReturn();

        MvcResult replay = reserve(key, 1, "order-reserve", REQUESTER, 17)
                .andExpect(status().isOk())
                .andExpect(header().string("Command-Outcome", "APPLIED"))
                .andReturn();

        assertThat(replay.getResponse().getContentAsString())
                .isEqualTo(applied.getResponse().getContentAsString());
        assertThat(count("select count(*) from credit_ledger where order_id = 'order-reserve' "
                + "and effect_type = 'RESERVATION'")) .isOne();
        assertThat(count("select count(*) from credit_reservations where order_id = 'order-reserve'"))
                .isOne();

        MvcResult statusResult = mvc.perform(get("/api/credits/commands/{key}", key)
                        .with(jwt().jwt(token -> token.subject(REQUESTER))))
                .andExpect(status().isOk())
                .andExpect(header().string("Idempotency-Key", key))
                .andExpect(header().string("Command-Outcome", "APPLIED"))
                .andExpect(jsonPath("$.commandId").value(key))
                .andExpect(jsonPath("$.operation").value("RESERVE"))
                .andExpect(jsonPath("$.orderId").value("order-reserve"))
                .andExpect(jsonPath("$.outcome").value("APPLIED"))
                .andExpect(jsonPath("$.code").value("SUCCEEDED"))
                .andReturn();
        assertThat(mapper.readTree(statusResult.getResponse().getContentAsByteArray()).size()).isEqualTo(5);
    }

    @Test
    void pendingLookupIsReadOnlyOwnerScopedAndAvailableToAFormerCourier() throws Exception {
        store.register(new CreditCommandStore.Binding("pending-assignment",
                CreditCommandOperation.ASSIGN_COURIER, COURIER, "pending-order", null, 1));

        mvc.perform(get("/api/credits/commands/pending-assignment")
                        .with(jwt().jwt(token -> token.subject(COURIER))))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.outcome").value("PENDING"))
                .andExpect(jsonPath("$.code").value("PENDING"));
        assertThat(count("select count(*) from credit_reservations where order_id = 'pending-order'"))
                .isZero();

        mvc.perform(get("/api/credits/commands/pending-assignment")
                        .with(jwt().jwt(token -> token.subject(OTHER))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.commandId").doesNotExist())
                .andExpect(jsonPath("$.orderId").doesNotExist());
        mvc.perform(get("/api/credits/commands/missing-command")
                        .with(jwt().jwt(token -> token.subject(COURIER))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("COMMAND_NOT_FOUND"));
        mvc.perform(get("/api/credits/commands/pending-assignment"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void immutableBindingRejectsReuseWithoutAdvancingTheFence() throws Exception {
        register(REQUESTER);
        register(OTHER);
        register(COURIER);
        String key = "immutable-command";
        reserve(key, 1, "bound-order", REQUESTER, 5).andExpect(status().isCreated());

        reserve(key, 9, "different-order", REQUESTER, 5)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("IDEMPOTENCY_KEY_REUSED"));
        reserve(key, 9, "bound-order", REQUESTER, 6)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("IDEMPOTENCY_KEY_REUSED"));
        reserve(key, 9, "bound-order", OTHER, 5)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("IDEMPOTENCY_KEY_REUSED"));
        mvc.perform(put("/api/credits/orders/bound-order/courier-assignment")
                        .with(courierJwt(COURIER))
                        .header("Idempotency-Key", key).header("X-Command-Generation", "9")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsBytes(new CourierAssignmentRequest(COURIER))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("IDEMPOTENCY_KEY_REUSED"));

        assertThat(jdbc.queryForObject("select highest_generation from credit_command_records "
                + "where command_id = ?", Long.class, key)).isOne();
    }

    @Test
    void definiteBusinessRejectionIsSavedAndReplayedWithoutAnEffect() throws Exception {
        register(REQUESTER);
        String key = "rejected-reserve";

        reserve(key, 1, "too-expensive", REQUESTER, 51)
                .andExpect(status().isConflict())
                .andExpect(header().string("Command-Outcome", "REJECTED"))
                .andExpect(jsonPath("$.error").value("INSUFFICIENT_CREDITS"));
        reserve(key, 2, "too-expensive", REQUESTER, 51)
                .andExpect(status().isConflict())
                .andExpect(header().string("Command-Outcome", "REJECTED"))
                .andExpect(jsonPath("$.error").value("INSUFFICIENT_CREDITS"));
        mvc.perform(get("/api/credits/commands/{key}", key).with(userJwt(REQUESTER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.outcome").value("REJECTED"))
                .andExpect(jsonPath("$.code").value("INSUFFICIENT_CREDITS"));
        assertThat(count("select count(*) from credit_reservations where order_id = 'too-expensive'"))
                .isZero();
        assertThat(count("select count(*) from credit_ledger where order_id = 'too-expensive'"))
                .isZero();
    }

    @Test
    void assignmentAndClearCommandsReplayWithoutRepeatingTheirEffects() throws Exception {
        register(REQUESTER);
        register(COURIER);
        legacyReserve("courier-order", REQUESTER, 8);

        assign("assign-command", 1, "courier-order", COURIER)
                .andExpect(status().isOk())
                .andExpect(header().string("Command-Outcome", "APPLIED"));
        assign("assign-command", 1, "courier-order", COURIER)
                .andExpect(status().isOk())
                .andExpect(header().string("Command-Outcome", "APPLIED"));
        assertThat(text("select courier_assignment_command_id from credit_reservations "
                + "where order_id = 'courier-order'")) .isEqualTo("assign-command");

        clear("clear-command", 2, "courier-order", COURIER)
                .andExpect(status().isOk())
                .andExpect(header().string("Command-Outcome", "APPLIED"));
        clear("clear-command", 2, "courier-order", COURIER)
                .andExpect(status().isOk())
                .andExpect(header().string("Command-Outcome", "APPLIED"));
        assertThat(text("select courier_id from credit_reservations where order_id = 'courier-order'"))
                .isNull();
    }

    @Test
    void compensationFencesPendingAndReversesReservationExactlyOnce() throws Exception {
        register(REQUESTER);
        store.register(new CreditCommandStore.Binding("pending-reserve", CreditCommandOperation.RESERVE,
                REQUESTER, "never-reserved", 4L, 1));

        compensate("pending-reserve", 2, REQUESTER, "ROLE_REQUESTER")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.outcome").value("COMPENSATED"))
                .andExpect(jsonPath("$.code").value("FENCED_NO_EFFECT"));
        reserve("pending-reserve", 1, "never-reserved", REQUESTER, 4)
                .andExpect(status().isConflict())
                .andExpect(header().string("Command-Outcome", "COMPENSATED"))
                .andExpect(jsonPath("$.error").value("COMMAND_COMPENSATED"));
        assertThat(count("select count(*) from credit_reservations where order_id = 'never-reserved'"))
                .isZero();

        reserve("reserve-to-reverse", 3, "reverse-order", REQUESTER, 12)
                .andExpect(status().isCreated());
        compensate("reserve-to-reverse", 4, REQUESTER, "ROLE_REQUESTER")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("REVERSED"));
        compensate("reserve-to-reverse", 4, REQUESTER, "ROLE_REQUESTER")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("REVERSED"));

        assertThat(jdbc.queryForObject("select reserved_balance from credit_accounts where user_id = ?",
                Long.class, REQUESTER)).isZero();
        assertThat(text("select status from credit_reservations where order_id = 'reverse-order'"))
                .isEqualTo("REFUNDED");
        assertThat(count("select count(*) from credit_ledger where origin_type = 'COMMAND_COMPENSATION' "
                + "and origin_id = 'reserve-to-reverse'")) .isOne();
        assertThat(count("select count(*) from credit_ledger where order_id = 'reverse-order'"))
                .isEqualTo(2);

        mvc.perform(get("/api/credits/me/transactions")
                        .with(userJwt(REQUESTER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(1))
                .andExpect(jsonPath("$.items[0].type").value("INITIAL_ALLOCATION"))
                .andExpect(jsonPath("$.items[?(@.orderId == 'reverse-order')]").isEmpty());
        mvc.perform(get("/api/credits/all/transactions")
                        .with(jwt().jwt(token -> token.subject("admin-user"))
                                .authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(1))
                .andExpect(jsonPath("$.items[0].userId").value(REQUESTER))
                .andExpect(jsonPath("$.items[?(@.orderId == 'reverse-order')]").isEmpty());
    }

    @Test
    void compensationUsesAssignmentIdentityAndNeverReconstructsAClearedCourier() throws Exception {
        register(REQUESTER);
        register(COURIER);
        legacyReserve("identity-order", REQUESTER, 9);

        assign("assignment-k1", 1, "identity-order", COURIER).andExpect(status().isOk());
        clear("clear-k2", 2, "identity-order", COURIER).andExpect(status().isOk());
        assign("assignment-k3", 3, "identity-order", COURIER).andExpect(status().isOk());

        compensate("assignment-k1", 4, COURIER, "ROLE_COURIER")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("RECONCILIATION_REQUIRED"));
        assertThat(text("select courier_assignment_command_id from credit_reservations "
                + "where order_id = 'identity-order'")) .isEqualTo("assignment-k3");

        compensate("assignment-k3", 4, COURIER, "ROLE_COURIER")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("REVERSED"));
        assertThat(text("select courier_id from credit_reservations where order_id = 'identity-order'"))
                .isNull();

        compensate("clear-k2", 5, COURIER, "ROLE_COURIER")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("RECONCILIATION_REQUIRED"));
        assertThat(text("select courier_id from credit_reservations where order_id = 'identity-order'"))
                .isNull();
    }

    @Test
    void unsafeReserveCompensationAndAuthorizationFailuresDoNotMutateState() throws Exception {
        register(REQUESTER);
        register(COURIER);
        reserve("unsafe-reserve", 1, "unsafe-order", REQUESTER, 6).andExpect(status().isCreated());
        assign("unsafe-assignment", 2, "unsafe-order", COURIER).andExpect(status().isOk());

        compensate("unsafe-reserve", 3, REQUESTER, "ROLE_REQUESTER")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("RECONCILIATION_REQUIRED"));
        compensate("unsafe-reserve", 3, OTHER, "ROLE_REQUESTER")
                .andExpect(status().isForbidden());
        compensate("unsafe-assignment", 3, COURIER)
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/credits/commands/unsafe-reserve/compensate")
                        .with(userJwt(REQUESTER))
                        .header("Idempotency-Key", "different-key")
                        .header("X-Command-Generation", "3"))
                .andExpect(status().isBadRequest());

        assertThat(text("select status from credit_reservations where order_id = 'unsafe-order'"))
                .isEqualTo("RESERVED");
        assertThat(text("select courier_id from credit_reservations where order_id = 'unsafe-order'"))
                .isEqualTo(COURIER);
    }

    @Test
    void staleExecutionAndCompensationCannotMutateAPendingCommand() throws Exception {
        register(REQUESTER);
        store.register(new CreditCommandStore.Binding("generation-fence", CreditCommandOperation.RESERVE,
                REQUESTER, "generation-order", 5L, 2));

        reserve("generation-fence", 1, "generation-order", REQUESTER, 5)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("STALE_COMMAND_GENERATION"));
        compensate("generation-fence", 1, REQUESTER, "ROLE_REQUESTER")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("STALE_COMMAND_GENERATION"));
        assertThat(text("select outcome from credit_command_records where command_id = 'generation-fence'"))
                .isEqualTo("PENDING");
        assertThat(count("select count(*) from credit_reservations where order_id = 'generation-order'"))
                .isZero();

        reserve("generation-fence", 2, "generation-order", REQUESTER, 5)
                .andExpect(status().isCreated());
    }

    @Test
    void concurrentSameKeyAndCompetingKeysConvergeOnDurableResults() throws Exception {
        register(REQUESTER);
        CountDownLatch start = new CountDownLatch(1);
        CompletableFuture<CommandMutationResult<ReservationResult>> first = asyncReserve(
                start, "same-key", "same-order");
        CompletableFuture<CommandMutationResult<ReservationResult>> second = asyncReserve(
                start, "same-key", "same-order");
        start.countDown();
        assertThat(List.of(first.join(), second.join()))
                .allMatch(value -> value.command().outcome() == CreditCommandOutcome.APPLIED);
        assertThat(count("select count(*) from credit_ledger where order_id = 'same-order' "
                + "and effect_type = 'RESERVATION'")) .isOne();

        CountDownLatch compete = new CountDownLatch(1);
        CompletableFuture<Object> k1 = asyncReserveOutcome(compete, "competing-k1", "competing-order");
        CompletableFuture<Object> k2 = asyncReserveOutcome(compete, "competing-k2", "competing-order");
        compete.countDown();
        List<Object> outcomes = List.of(k1.join(), k2.join());
        assertThat(outcomes.stream().filter(CommandMutationResult.class::isInstance).count()).isOne();
        assertThat(outcomes.stream().filter(CreditCommandException.class::isInstance).count()).isOne();
        assertThat(count("select count(*) from credit_command_records where order_id = 'competing-order' "
                + "and outcome = 'APPLIED'")) .isOne();
        assertThat(count("select count(*) from credit_command_records where order_id = 'competing-order' "
                + "and outcome = 'REJECTED'")) .isOne();
    }

    @Test
    void crashBoundariesLeaveEitherNoCommandOrAResumablePendingCommand() throws Exception {
        register(REQUESTER);
        doThrow(new IllegalStateException("before pending commit"))
                .when(commandRepository).insertIfAbsent(anyString(), any(), anyString(), anyString(),
                        anyLong(), anyString(), anyLong(), any());
        assertThatThrownBy(() -> commands.reserve(
                "before-pending", 1, "before-pending-order", REQUESTER, 3))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("before pending commit");
        assertThat(count("select count(*) from credit_command_records where command_id = 'before-pending'"))
                .isZero();
        assertThat(count("select count(*) from credit_reservations where order_id = 'before-pending-order'"))
                .isZero();
        org.mockito.Mockito.reset(commandRepository);

        doThrow(new IllegalStateException("during financial transaction"))
                .when(ledgerRepository).save(any(CreditLedgerEntity.class));
        assertThatThrownBy(() -> commands.reserve(
                "during-effect", 1, "during-effect-order", REQUESTER, 3))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("during financial transaction");
        assertThat(text("select outcome from credit_command_records where command_id = 'during-effect'"))
                .isEqualTo("PENDING");
        assertThat(count("select count(*) from credit_reservations where order_id = 'during-effect-order'"))
                .isZero();
        assertThat(jdbc.queryForObject("select reserved_balance from credit_accounts where user_id = ?",
                Long.class, REQUESTER)).isZero();

        org.mockito.Mockito.reset(ledgerRepository);
        CommandMutationResult<ReservationResult> resumed = commands.reserve(
                "during-effect", 2, "during-effect-order", REQUESTER, 3);
        assertThat(resumed.command().outcome()).isEqualTo(CreditCommandOutcome.APPLIED);
        assertThat(count("select count(*) from credit_ledger where order_id = 'during-effect-order' "
                + "and effect_type = 'RESERVATION'")) .isOne();
    }

    @Test
    void orderContractHarnessRecoversLostResponsesAndUsesTheDecisionTable() throws Exception {
        register(REQUESTER);
        OrderContractHarness order = new OrderContractHarness("harness-key", 1,
                "harness-order", REQUESTER, 11);

        order.sendReserveAndLoseResponse();
        assertThat(order.state).isEqualTo(OrderState.PENDING);
        order.recover();
        assertThat(order.state).isEqualTo(OrderState.APPLIED);
        assertThat(count("select count(*) from credit_ledger where order_id = 'harness-order' "
                + "and effect_type = 'RESERVATION'")) .isOne();

        assertThat(OrderContractHarness.decide(202, "PENDING")).isEqualTo(OrderState.PENDING);
        assertThat(OrderContractHarness.decide(500, null)).isEqualTo(OrderState.PENDING);
        assertThat(OrderContractHarness.decide(401, null)).isEqualTo(OrderState.PENDING);
        assertThat(OrderContractHarness.decide(403, null)).isEqualTo(OrderState.PENDING);
        assertThat(OrderContractHarness.decide(200, "REJECTED")).isEqualTo(OrderState.REJECTED);
        assertThat(OrderContractHarness.decide(200, "COMPENSATED")).isEqualTo(OrderState.REJECTED);

        OrderContractHarness missing = new OrderContractHarness("same-key-after-404", 1,
                "same-action-after-404", REQUESTER, 2);
        missing.recoverOrReplayAfterNotFound();
        assertThat(missing.key).isEqualTo("same-key-after-404");
        assertThat(missing.state).isEqualTo(OrderState.APPLIED);

        OrderContractHarness finalizationFailure = new OrderContractHarness("finalization-key", 1,
                "finalization-order", REQUESTER, 4);
        finalizationFailure.sendReserveAndLoseResponse();
        finalizationFailure.compensateAfterOrderFailure();
        assertThat(finalizationFailure.state).isEqualTo(OrderState.REJECTED);
        assertThat(text("select status from credit_reservations where order_id = 'finalization-order'"))
                .isEqualTo("REFUNDED");
    }

    @Test
    void pendingAndTerminalCommandsSurviveAnApplicationRestart() throws Exception {
        register(REQUESTER);
        store.register(new CreditCommandStore.Binding("restart-pending", CreditCommandOperation.RESERVE,
                REQUESTER, "restart-pending-order", 2L, 1));
        commands.reserve("restart-applied", 1, "restart-applied-order", REQUESTER, 2);

        HikariDataSource hikari = dataSource.unwrap(HikariDataSource.class);
        try (ConfigurableApplicationContext restarted = new SpringApplicationBuilder(
                CreditServiceApplication.class)
                .web(WebApplicationType.SERVLET)
                .run(
                        "--server.port=0",
                        "--spring.datasource.url=" + hikari.getJdbcUrl(),
                        "--spring.datasource.username=" + hikari.getUsername(),
                        "--spring.datasource.password=" + hikari.getPassword())) {
            CreditCommandService restartedCommands = restarted.getBean(CreditCommandService.class);
            assertThat(restartedCommands.status("restart-pending", REQUESTER).outcome())
                    .isEqualTo(CreditCommandOutcome.PENDING);
            assertThat(restartedCommands.status("restart-applied", REQUESTER).outcome())
                    .isEqualTo(CreditCommandOutcome.APPLIED);
        }
    }

    private CompletableFuture<CommandMutationResult<ReservationResult>> asyncReserve(
            CountDownLatch start, String key, String orderId) {
        return CompletableFuture.supplyAsync(() -> {
            await(start);
            return commands.reserve(key, 1, orderId, REQUESTER, 1);
        });
    }

    private CompletableFuture<Object> asyncReserveOutcome(CountDownLatch start, String key,
                                                           String orderId) {
        return CompletableFuture.supplyAsync(() -> {
            await(start);
            try {
                return commands.reserve(key, 1, orderId, REQUESTER, 1);
            } catch (CreditCommandException exception) {
                return exception;
            }
        });
    }

    private static void await(CountDownLatch latch) {
        try {
            latch.await();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new CompletionException(exception);
        }
    }

    private org.springframework.test.web.servlet.ResultActions reserve(
            String key, long generation, String orderId, String requester, long amount) throws Exception {
        return mvc.perform(put("/api/credits/orders/{orderId}/reservation", orderId)
                .with(userJwt(requester))
                .header("Idempotency-Key", key)
                .header("X-Command-Generation", generation)
                .contentType(MediaType.APPLICATION_JSON)
                .content(reserveBody(requester, amount)));
    }

    private org.springframework.test.web.servlet.ResultActions assign(
            String key, long generation, String orderId, String courier) throws Exception {
        return mvc.perform(put("/api/credits/orders/{orderId}/courier-assignment", orderId)
                .with(courierJwt(courier))
                .header("Idempotency-Key", key)
                .header("X-Command-Generation", generation)
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsBytes(new CourierAssignmentRequest(courier))));
    }

    private org.springframework.test.web.servlet.ResultActions clear(
            String key, long generation, String orderId, String courier) throws Exception {
        return mvc.perform(post("/api/credits/orders/{orderId}/hold-for-reopen", orderId)
                .with(courierJwt(courier))
                .header("Idempotency-Key", key)
                .header("X-Command-Generation", generation));
    }

    private org.springframework.test.web.servlet.ResultActions compensate(
            String key, long generation, String actor, String... roles) throws Exception {
        RequestPostProcessor authentication = jwt().jwt(token -> token.subject(actor))
                .authorities(java.util.Arrays.stream(roles)
                        .map(role -> (GrantedAuthority) new SimpleGrantedAuthority(role)).toList());
        return mvc.perform(post("/api/credits/commands/{key}/compensate", key)
                .with(authentication)
                .header("Idempotency-Key", key)
                .header("X-Command-Generation", generation));
    }

    private void assertValidation(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request)
            throws Exception {
        mvc.perform(request)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("VALIDATION_ERROR"));
    }

    private void register(String userId) throws Exception {
        userCreatedEvents.handle(new UserCreatedEventMessage(
                UUID.randomUUID(), userId, userId + "@u.nus.edu",
                Instant.parse("2026-10-11T00:00:00Z"), 1));
    }

    private void legacyReserve(String orderId, String requester, long amount) throws Exception {
        mvc.perform(put("/api/credits/orders/{orderId}/reservation", orderId)
                        .with(jwt().jwt(token -> token.subject(requester)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reserveBody(requester, amount)))
                .andExpect(status().isCreated());
    }

    private byte[] reserveBody(String requester, long amount) throws Exception {
        return mapper.writeValueAsBytes(new ReserveCreditsRequest(requester, amount));
    }

    private long count(String sql) {
        return jdbc.queryForObject(sql, Long.class);
    }

    private String text(String sql) {
        return jdbc.queryForObject(sql, String.class);
    }

    private static RequestPostProcessor userJwt(String userId) {
        return jwt().jwt(token -> token.subject(userId))
                .authorities(new SimpleGrantedAuthority("ROLE_REQUESTER"));
    }

    private static RequestPostProcessor courierJwt(String userId) {
        return jwt().jwt(token -> token.subject(userId))
                .authorities(new SimpleGrantedAuthority("ROLE_COURIER"));
    }

    private enum OrderState { PENDING, APPLIED, REJECTED }

    private final class OrderContractHarness {
        private final String key;
        private final long generation;
        private final String orderId;
        private final String requester;
        private final long amount;
        private OrderState state = OrderState.PENDING;

        private OrderContractHarness(String key, long generation, String orderId,
                                     String requester, long amount) {
            this.key = key;
            this.generation = generation;
            this.orderId = orderId;
            this.requester = requester;
            this.amount = amount;
        }

        private void sendReserveAndLoseResponse() throws Exception {
            reserve(key, generation, orderId, requester, amount).andExpect(status().isCreated());
        }

        private void recover() throws Exception {
            MvcResult result = mvc.perform(get("/api/credits/commands/{key}", key)
                            .with(userJwt(requester)))
                    .andReturn();
            JsonNode body = mapper.readTree(result.getResponse().getContentAsByteArray());
            state = decide(result.getResponse().getStatus(), body.path("outcome").asString(null));
        }

        private void recoverOrReplayAfterNotFound() throws Exception {
            MvcResult lookup = mvc.perform(get("/api/credits/commands/{key}", key)
                            .with(userJwt(requester)))
                    .andExpect(status().isNotFound())
                    .andReturn();
            if (lookup.getResponse().getStatus() == 404) {
                reserve(key, generation, orderId, requester, amount).andExpect(status().isCreated());
            }
            recover();
        }

        private void compensateAfterOrderFailure() throws Exception {
            MvcResult result = compensate(key, generation + 1, requester, "ROLE_REQUESTER")
                    .andReturn();
            JsonNode body = mapper.readTree(result.getResponse().getContentAsByteArray());
            state = result.getResponse().getStatus() == 409
                    ? OrderState.PENDING
                    : decide(result.getResponse().getStatus(), body.path("outcome").asString(null));
        }

        private static OrderState decide(int status, String outcome) {
            if (status != 200) {
                return OrderState.PENDING;
            }
            if ("APPLIED".equals(outcome)) {
                return OrderState.APPLIED;
            }
            if ("REJECTED".equals(outcome) || "COMPENSATED".equals(outcome)) {
                return OrderState.REJECTED;
            }
            return OrderState.PENDING;
        }
    }
}
