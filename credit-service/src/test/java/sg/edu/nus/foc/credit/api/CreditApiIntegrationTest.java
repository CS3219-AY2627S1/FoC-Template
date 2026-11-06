/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-09-25
 * Mode: Test generation and testing assistance.
 * Scope: Generated initial API integration and OpenAPI verification tests for team-finalized behavior.
 * Author review: I reviewed for correctness, edited where needed, and added boundary cases.
 */
package sg.edu.nus.foc.credit.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import sg.edu.nus.foc.credit.config.CreditPushProperties;
import sg.edu.nus.foc.credit.support.PostgreSqlTestContainer;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest
@AutoConfigureMockMvc
class CreditApiIntegrationTest {

    private static final String USER = "firebase-user-123";

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        PostgreSqlTestContainer.register(registry);
    }

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JsonMapper mapper;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private CreditPushProperties pushProperties;

    @BeforeEach
    void reset() {
        jdbc.execute("truncate table credit_ledger, credit_reservations, "
                + "credit_idempotency_records, credit_accounts cascade");
    }

    @Test
    void userCreatedEventInitializesExactlyOneCreditAccount() throws Exception {
        UUID eventId = UUID.fromString("c91e4571-329a-4399-b87f-a756a6ab7243");
        byte[] body = mapper.writeValueAsBytes(userCreatedEnvelope(USER, eventId));

        mvc.perform(post(CreditUserEventController.USER_CREATED_PATH)
                        .with(jwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isNoContent());
        mvc.perform(post(CreditUserEventController.USER_CREATED_PATH)
                        .with(jwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isNoContent());

        assertThat(jdbc.queryForObject(
                "select total_balance from credit_accounts where user_id = ?",
                Long.class, USER)).isEqualTo(50L);
        assertThat(jdbc.queryForObject(
                "select count(*) from credit_ledger where user_id = ? and effect_type = 'INITIAL_ALLOCATION'",
                Long.class, USER)).isEqualTo(1L);
    }

    @Test
    void legacyRegistrationFactEndpointIsRemoved() throws Exception {
        mvc.perform(post("/api/credits/registration-facts")
                        .with(jwt().jwt(token -> token.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void authenticatedUserCanReadOnlyTheirOwnCurrentBalance() throws Exception {
        register(USER);
        reserve("order-1", USER, 20);

        mvc.perform(get("/api/credits/me")
                        .with(jwt().jwt(token -> token.subject(USER))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(USER))
                .andExpect(jsonPath("$.totalBalance").value(50))
                .andExpect(jsonPath("$.reservedBalance").value(20))
                .andExpect(jsonPath("$.usableBalance").value(30))
                .andExpect(jsonPath("$.version").doesNotExist())
                .andExpect(jsonPath("$.asOf").exists());

        String otherUser = "firebase-user-456";
        register(otherUser);
        mvc.perform(get("/api/credits/me")
                        .with(jwt().jwt(token -> token.subject(otherUser))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(otherUser))
                .andExpect(jsonPath("$.totalBalance").value(50))
                .andExpect(jsonPath("$.reservedBalance").value(0))
                .andExpect(jsonPath("$.usableBalance").value(50));
    }

    @Test
    void balanceRequiresAuthenticationAndAnExistingAccount() throws Exception {
        mvc.perform(get("/api/credits/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("UNAUTHENTICATED"));

        mvc.perform(get("/api/credits/me")
                        .with(jwt().jwt(token -> token.subject("missing-user"))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("ACCOUNT_NOT_FOUND"));
    }

    @Test
    void transactionHistoryIsUserScopedNewestFirstAndPaginated() throws Exception {
        register(USER);
        reserve("order-1", USER, 20);
        register("other-user");

        mvc.perform(get("/api/credits/me/transactions?page=1&size=1")
                        .with(jwt().jwt(token -> token.subject(USER))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.size").value(1))
                .andExpect(jsonPath("$.totalItems").value(2))
                .andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.items[0].type").value("RESERVATION"))
                .andExpect(jsonPath("$.items[0].direction").value("DEBIT"))
                .andExpect(jsonPath("$.items[0].amount").value(20))
                .andExpect(jsonPath("$.items[0].orderId").value("order-1"))
                .andExpect(jsonPath("$.items[0].occurredAt").exists());

        mvc.perform(get("/api/credits/me/transactions?page=2&size=1")
                        .with(jwt().jwt(token -> token.subject(USER))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].type").value("INITIAL_ALLOCATION"))
                .andExpect(jsonPath("$.items[0].direction").value("CREDIT"))
                .andExpect(jsonPath("$.items[0].orderId").doesNotExist());

        mvc.perform(get("/api/credits/me/transactions")
                        .with(jwt().jwt(token -> token.subject("other-user"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(1));
    }

    @Test
    void transactionHistoryRequiresValidPaginationAuthenticationAndAccount() throws Exception {
        mvc.perform(get("/api/credits/me/transactions?page=0&size=101")
                        .with(jwt().jwt(token -> token.subject(USER))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("VALIDATION_ERROR"));
        mvc.perform(get("/api/credits/me/transactions"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/credits/me/transactions")
                        .with(jwt().jwt(token -> token.subject("missing-user"))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("ACCOUNT_NOT_FOUND"));
    }

    @Test
    void adminCanReadAnotherUsersCurrentBalance() throws Exception {
        register(USER);
        reserve("order-1", USER, 20);

        mvc.perform(get("/api/credits/users/{userId}/balance", USER)
                        .with(adminJwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(USER))
                .andExpect(jsonPath("$.totalBalance").value(50))
                .andExpect(jsonPath("$.reservedBalance").value(20))
                .andExpect(jsonPath("$.usableBalance").value(30))
                .andExpect(jsonPath("$.asOf").exists())
                .andExpect(jsonPath("$.version").doesNotExist());
    }

    @Test
    void adminBalanceRejectsInvalidOrUnauthorizedRequests() throws Exception {
        mvc.perform(get("/api/credits/users/missing-user/balance"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("UNAUTHENTICATED"));
        mvc.perform(get("/api/credits/users/missing-user/balance")
                        .with(jwt().jwt(token -> token.subject(USER))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("FORBIDDEN"));
        mvc.perform(get("/api/credits/users/missing-user/balance")
                        .with(adminJwt()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("ACCOUNT_NOT_FOUND"));
        mvc.perform(get("/api/credits/users/__reserved__/balance")
                        .with(adminJwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("VALIDATION_ERROR"));
    }

    @Test
    void adminCanReadAnotherUsersTransactionsWithoutChangingTheExistingWireShape() throws Exception {
        register(USER);
        reserve("order-1", USER, 20);
        register("other-user");

        mvc.perform(get("/api/credits/users/{userId}/transactions?page=1&size=1", USER)
                        .with(adminJwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.size").value(1))
                .andExpect(jsonPath("$.totalItems").value(2))
                .andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.items[0].type").value("RESERVATION"))
                .andExpect(jsonPath("$.items[0].orderId").value("order-1"))
                .andExpect(jsonPath("$.items[0].userId").doesNotExist());

        mvc.perform(get("/api/credits/users/other-user/transactions")
                        .with(adminJwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(1));
    }

    @Test
    void adminUserHistoryRejectsInvalidOrUnauthorizedRequests() throws Exception {
        mvc.perform(get("/api/credits/users/missing-user/transactions"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/credits/users/missing-user/transactions")
                        .with(jwt().jwt(token -> token.subject(USER))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("FORBIDDEN"));
        mvc.perform(get("/api/credits/users/missing-user/transactions")
                        .with(adminJwt()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("ACCOUNT_NOT_FOUND"));
        mvc.perform(get("/api/credits/users/__reserved__/transactions")
                        .with(adminJwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("VALIDATION_ERROR"));
        mvc.perform(get("/api/credits/users/missing-user/transactions?page=0&size=101")
                        .with(adminJwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("VALIDATION_ERROR"));
    }

    @Test
    void adminCanReadAllTransactionsWithOwningUserAndPagination() throws Exception {
        mvc.perform(get("/api/credits/all/transactions").with(adminJwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isEmpty())
                .andExpect(jsonPath("$.totalItems").value(0))
                .andExpect(jsonPath("$.totalPages").value(0));

        register(USER);
        register("other-user");
        reserve("order-1", USER, 20);

        mvc.perform(get("/api/credits/all/transactions?page=1&size=2")
                        .with(adminJwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.size").value(2))
                .andExpect(jsonPath("$.totalItems").value(3))
                .andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.items[0].userId").value(USER))
                .andExpect(jsonPath("$.items[0].type").value("RESERVATION"))
                .andExpect(jsonPath("$.items[0].orderId").value("order-1"))
                .andExpect(jsonPath("$.items[1].userId").value("other-user"));

        mvc.perform(get("/api/credits/all/transactions?page=2&size=2")
                        .with(adminJwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].userId").value(USER));
    }

    @Test
    void allTransactionsRequiresAdminAndValidPagination() throws Exception {
        mvc.perform(get("/api/credits/all/transactions"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/credits/all/transactions")
                        .with(jwt().jwt(token -> token.subject(USER))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("FORBIDDEN"));
        mvc.perform(get("/api/credits/all/transactions?page=0&size=101")
                        .with(adminJwt()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("VALIDATION_ERROR"));
    }

    @Test
    void reservesByOrderIdReplaysAndAllowsOwnerRecovery() throws Exception {
        register(USER);
        ReserveCreditsRequest request = new ReserveCreditsRequest(USER, 20);

        mvc.perform(put("/api/credits/orders/order-1/reservation")
                        .with(jwt().jwt(token -> token.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsBytes(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.orderId").value("order-1"))
                .andExpect(jsonPath("$.status").value("RESERVED"))
                .andExpect(jsonPath("$.balance.totalBalance").value(50))
                .andExpect(jsonPath("$.balance.reservedBalance").value(20))
                .andExpect(jsonPath("$.balance.usableBalance").value(30));

        mvc.perform(put("/api/credits/orders/order-1/reservation")
                        .with(jwt().jwt(token -> token.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsBytes(request)))
                .andExpect(status().isOk());

        mvc.perform(get("/api/credits/orders/order-1/reservation")
                        .with(jwt().jwt(token -> token.subject(USER))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RESERVED"))
                .andExpect(jsonPath("$.balance").doesNotExist());
    }

    @Test
    void reservationFailuresUseStableErrorsAndDoNotLeakOwnership() throws Exception {
        register(USER);
        mvc.perform(put("/api/credits/orders/order-1/reservation")
                        .with(jwt().jwt(token -> token.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsBytes(new ReserveCreditsRequest(USER, 51))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("INSUFFICIENT_CREDITS"));

        reserve("order-1", USER, 20);
        mvc.perform(put("/api/credits/orders/order-1/reservation")
                        .with(jwt().jwt(token -> token.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsBytes(new ReserveCreditsRequest(USER, 21))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("RESERVATION_CONFLICT"));
        mvc.perform(get("/api/credits/orders/order-1/reservation")
                        .with(jwt().jwt(token -> token.subject("someone-else"))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("RESERVATION_NOT_FOUND"));
        mvc.perform(get("/api/credits/orders/missing/reservation")
                        .with(jwt().jwt(token -> token.subject(USER))))
                .andExpect(status().isNotFound());
    }

    @Test
    void rejectsMissingAccountInvalidAmountInvalidIdsAndMalformedJson() throws Exception {
        mvc.perform(put("/api/credits/orders/order-1/reservation")
                        .with(jwt().jwt(token -> token.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsBytes(new ReserveCreditsRequest(USER, 1))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("ACCOUNT_NOT_FOUND"));

        register(USER);
        mvc.perform(put("/api/credits/orders/order-1/reservation")
                        .with(jwt().jwt(token -> token.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsBytes(new ReserveCreditsRequest(USER, 0))))
                .andExpect(status().isBadRequest());
        mvc.perform(put("/api/credits/orders/../reservation")
                        .with(jwt().jwt(token -> token.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsBytes(new ReserveCreditsRequest(USER, 1))))
                .andExpect(status().is4xxClientError());
        mvc.perform(put("/api/credits/orders/order-2/reservation")
                        .with(jwt().jwt(token -> token.subject(USER)))
                        .contentType(MediaType.APPLICATION_JSON).content("not-json"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void pushEndpointRequiresAuthenticationAndNacksInvalidPayloads() throws Exception {
        PubSubPushEnvelope envelope = new PubSubPushEnvelope(
                new PubSubPushEnvelope.Message("%%%", "message-1", Map.of()),
                "projects/demo-foc/subscriptions/credit-order-completion-dev-v1");
        byte[] body = mapper.writeValueAsBytes(envelope);

        mvc.perform(post(CreditOrderEventController.COMPLETION_PATH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isUnauthorized());
        mvc.perform(post(CreditOrderEventController.COMPLETION_PATH)
                        .with(jwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("VALIDATION_ERROR"));

        mvc.perform(post(CreditUserEventController.USER_CREATED_PATH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isUnauthorized());

        mvc.perform(post(CreditOrderEventController.PUSH_PATH)
                        .with(jwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isNotFound());
        mvc.perform(post(CreditOrderEventController.PUSH_PATH + "/accepted-cancellation")
                        .with(jwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isNotFound());
    }

    @Test
    void requesterCancellationEventRefundsTheReservationExactlyOnce() throws Exception {
        register(USER);
        reserve("order-1", USER, 13);
        String cancellation = """
                {
                  "eventId":"refund-event-1",
                  "eventType":"OpenOrderRefundTaskEvent",
                  "orderId":"order-1",
                  "orderStatus":"CANCELLED",
                  "creditAmount":13,
                  "occurredAt":"2026-10-08T15:09:44.158371715Z",
                  "courierId":null
                }
                """;

        String encoded = Base64.getEncoder().encodeToString(
                cancellation.getBytes(StandardCharsets.UTF_8));
        PubSubPushEnvelope envelope = new PubSubPushEnvelope(
                new PubSubPushEnvelope.Message(encoded, "message-1", Map.of(
                        "eventId", "refund-event-1",
                        "eventType", "OpenOrderRefundTaskEvent",
                        "eventVersion", "2")),
                pushProperties.openRefundSubscriptionPath());
        byte[] pushBody = mapper.writeValueAsBytes(envelope);

        mvc.perform(post(CreditOrderEventController.OPEN_REFUND_PATH)
                        .with(jwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(pushBody))
                .andExpect(status().isNoContent());
        mvc.perform(post(CreditOrderEventController.OPEN_REFUND_PATH)
                        .with(jwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(pushBody))
                .andExpect(status().isNoContent());

        assertThat(jdbc.queryForObject(
                "select status from credit_reservations where order_id = 'order-1'", String.class))
                .isEqualTo("REFUNDED");
        assertThat(jdbc.queryForObject(
                "select reserved_balance from credit_accounts where user_id = ?", Long.class, USER))
                .isZero();
        assertThat(jdbc.queryForObject(
                "select count(*) from credit_ledger where order_id = 'order-1' and effect_type = 'REFUND'",
                Long.class))
                .isOne();
    }

    @Test
    void responseNeverUsesDeprecatedActiveStatusOrOperationId() throws Exception {
        register(USER);
        String response = reserve("order-1", USER, 5);
        assertThat(response).contains("RESERVED")
                .doesNotContain("ACTIVE")
                .doesNotContain("operationId")
                .doesNotContain("version");
    }

    @Test
    void assignsCourierAndHoldsReservationForReopenIdempotently() throws Exception {
        String courier = "courier-1";
        register(USER);
        register(courier);
        reserve("order-1", USER, 5);

        byte[] assignment = mapper.writeValueAsBytes(new CourierAssignmentRequest(courier));
        mvc.perform(put("/api/credits/orders/order-1/courier-assignment")
                        .with(courierJwt(courier))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(assignment))
                .andExpect(status().isOk());
        mvc.perform(put("/api/credits/orders/order-1/courier-assignment")
                        .with(courierJwt(courier))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(assignment))
                .andExpect(status().isOk());

        mvc.perform(post("/api/credits/orders/order-1/hold-for-reopen")
                        .with(courierJwt(courier)))
                .andExpect(status().isOk());
        mvc.perform(post("/api/credits/orders/order-1/hold-for-reopen")
                        .with(courierJwt(courier)))
                .andExpect(status().isOk());

        assertThat(jdbc.queryForObject(
                "select courier_id from credit_reservations where order_id = 'order-1'", String.class))
                .isNull();
    }

    @Test
    void assignmentAndHoldRejectWrongIdentityOrState() throws Exception {
        String courier = "courier-1";
        String other = "courier-2";
        register(USER);
        register(courier);
        register(other);
        reserve("order-1", USER, 5);

        byte[] assignment = mapper.writeValueAsBytes(new CourierAssignmentRequest(courier));
        mvc.perform(put("/api/credits/orders/order-1/courier-assignment")
                        .with(courierJwt(other))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(assignment))
                .andExpect(status().isForbidden());
        mvc.perform(put("/api/credits/orders/order-1/courier-assignment")
                        .with(courierJwt(courier))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(assignment))
                .andExpect(status().isOk());
        mvc.perform(post("/api/credits/orders/order-1/hold-for-reopen")
                        .with(courierJwt(other)))
                .andExpect(status().isForbidden());

        byte[] conflict = mapper.writeValueAsBytes(new CourierAssignmentRequest(other));
        mvc.perform(put("/api/credits/orders/order-1/courier-assignment")
                        .with(courierJwt(other))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(conflict))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("RESERVATION_CONFLICT"));
    }

    @Test
    void courierMutationsRequireCourierRoleWithoutChangingReservation() throws Exception {
        String courier = "courier-1";
        register(USER);
        register(courier);
        reserve("order-1", USER, 5);

        byte[] assignment = mapper.writeValueAsBytes(new CourierAssignmentRequest(courier));
        mvc.perform(put("/api/credits/orders/order-1/courier-assignment")
                        .with(jwt().jwt(token -> token.subject(courier)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(assignment))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("FORBIDDEN"));
        assertThat(jdbc.queryForObject(
                "select courier_id from credit_reservations where order_id = 'order-1'", String.class))
                .isNull();

        mvc.perform(put("/api/credits/orders/order-1/courier-assignment")
                        .with(courierJwt(courier))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(assignment))
                .andExpect(status().isOk());
        mvc.perform(post("/api/credits/orders/order-1/hold-for-reopen")
                        .with(jwt().jwt(token -> token.subject(courier))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("FORBIDDEN"));
        assertThat(jdbc.queryForObject(
                "select courier_id from credit_reservations where order_id = 'order-1'", String.class))
                .isEqualTo(courier);
    }

    private void register(String userId) throws Exception {
        mvc.perform(post(CreditUserEventController.USER_CREATED_PATH)
                        .with(jwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsBytes(userCreatedEnvelope(userId, UUID.randomUUID()))))
                .andExpect(status().isNoContent());
    }

    private PubSubPushEnvelope userCreatedEnvelope(String userId, UUID eventId) {
        String event = """
                {"eventId":"%s","userId":"%s","email":"%s@u.nus.edu",
                 "occurredAt":"2026-10-25T08:00:00Z","schemaVersion":1}
                """.formatted(eventId, userId, userId);
        String encoded = Base64.getEncoder().encodeToString(event.getBytes(StandardCharsets.UTF_8));
        return new PubSubPushEnvelope(
                new PubSubPushEnvelope.Message(encoded, UUID.randomUUID().toString(), Map.of(
                        "eventId", eventId.toString(),
                        "eventType", "UserCreated",
                        "eventVersion", "1")),
                pushProperties.userCreatedSubscriptionPath());
    }

    private String reserve(String orderId, String userId, long amount) throws Exception {
        return mvc.perform(put("/api/credits/orders/{orderId}/reservation", orderId)
                        .with(jwt().jwt(token -> token.subject(userId)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsBytes(new ReserveCreditsRequest(userId, amount))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    private static RequestPostProcessor courierJwt(String userId) {
        return jwt()
                .jwt(token -> token.subject(userId))
                .authorities(new SimpleGrantedAuthority("ROLE_COURIER"));
    }

    private static RequestPostProcessor adminJwt() {
        return jwt()
                .jwt(token -> token.subject("admin-user"))
                .authorities(new SimpleGrantedAuthority("ROLE_ADMIN"));
    }
}
