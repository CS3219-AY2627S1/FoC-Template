package sg.edu.nus.foc.order.adapter;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

import java.io.IOException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.client.response.DefaultResponseCreator;
import org.springframework.web.client.RestClient;
import sg.edu.nus.foc.order.application.recovery.CreditCommandGateway.Mutation;
import sg.edu.nus.foc.order.domain.OrderProblem;

/** ADR-035 wire contract; fixture responses do not replace the actual provider tests. */
class HttpCreditCommandGatewayTest {
    private MockRestServiceServer server;
    private HttpCreditCommandGateway gateway;

    @BeforeEach
    void setup() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        gateway = new HttpCreditCommandGateway(builder.build());
    }

    private Mutation mutation(String kind) {
        return new Mutation(kind, "order", "actor", 5);
    }

    private String result(String operation, String outcome, String code) {
        return "{\"commandId\":\"K\",\"operation\":\"" + operation
                + "\",\"orderId\":\"order\",\"outcome\":\"" + outcome
                + "\",\"code\":\"" + code + "\"}";
    }

    private DefaultResponseCreator saved(String body, String outcome) {
        return withSuccess(body, MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", "K").header("Command-Outcome", outcome);
    }

    private void missing() {
        server.expect(requestTo("/api/credits/commands/K"))
                .andExpect(method(HttpMethod.GET)).andExpect(header("Authorization", "Bearer token"))
                .andRespond(withStatus(HttpStatus.NOT_FOUND).contentType(MediaType.APPLICATION_JSON)
                        .body("{\"error\":\"COMMAND_NOT_FOUND\"}"));
    }

    @ParameterizedTest
    @CsvSource({"CREATE,RESERVE,PUT,reservation", "ACCEPT,ASSIGN_COURIER,PUT,courier-assignment",
            "ABORT,CLEAR_COURIER,POST,hold-for-reopen"})
    void sendsSameKeyGenerationAndOnlyRequiredBusinessData(String kind, String operation,
            String method, String path) {
        missing();
        server.expect(requestTo("/api/credits/orders/order/" + path))
                .andExpect(method(HttpMethod.valueOf(method)))
                .andExpect(header("Authorization", "Bearer token"))
                .andExpect(header("Idempotency-Key", "K"))
                .andExpect(header("X-Command-Generation", "7"))
                .andExpect(request -> {
                    if (kind.equals("ABORT")) {
                        content().string("").match(request);
                    } else {
                        content().json(kind.equals("CREATE") ? "{\"requesterId\":\"actor\",\"amount\":5}"
                                : "{\"courierId\":\"actor\"}", org.springframework.test.json.JsonCompareMode.STRICT).match(request);
                    }
                })
                .andRespond(withStatus(kind.equals("CREATE") ? HttpStatus.CREATED : HttpStatus.OK)
                        .header("Idempotency-Key", "K").header("Command-Outcome", "APPLIED"));
        assertTrue(gateway.execute("K", mutation(kind), 7, "Bearer token").applied());
        server.verify();
    }

    @ParameterizedTest
    @CsvSource({"APPLIED,SUCCEEDED,true", "REJECTED,INSUFFICIENT_CREDITS,false", "COMPENSATED,REVERSED,false"})
    void returnsHistoricalTerminalOutcomeWithoutAnotherMutation(String outcome, String code, boolean applied) {
        server.expect(requestTo("/api/credits/commands/K"))
                .andRespond(saved(result("RESERVE", outcome, code), outcome));
        assertEquals(applied, gateway.execute("K", mutation("CREATE"), 2, "Bearer token").applied());
        server.verify();
    }

    @Test
    void replaysPendingWithTheCurrentGeneration() {
        server.expect(requestTo("/api/credits/commands/K"))
                .andRespond(withStatus(HttpStatus.ACCEPTED).contentType(MediaType.APPLICATION_JSON)
                        .body(result("CLEAR_COURIER", "PENDING", "PENDING")));
        server.expect(requestTo("/api/credits/orders/order/hold-for-reopen"))
                .andExpect(header("X-Command-Generation", "3"))
                .andRespond(withSuccess().header("Idempotency-Key", "K").header("Command-Outcome", "APPLIED"));
        assertTrue(gateway.execute("K", mutation("ABORT"), 3, "Bearer token").applied());
        server.verify();
    }

    @ParameterizedTest
    @CsvSource({"401,UNAUTHENTICATED", "403,FORBIDDEN", "429,SERVICE_UNAVAILABLE", "503,SERVICE_UNAVAILABLE"})
    void attemptErrorsDoNotBecomeSavedRejections(int status, String expected) {
        missing();
        server.expect(requestTo("/api/credits/orders/order/reservation"))
                .andRespond(withStatus(org.springframework.http.HttpStatusCode.valueOf(status))
                        .body("private provider diagnostic"));
        OrderProblem problem = assertThrows(OrderProblem.class,
                () -> gateway.execute("K", mutation("CREATE"), 1, "Bearer token"));
        assertEquals(expected, problem.getCode());
        assertFalse(problem.getMessage().contains("private"));
        server.verify();
    }

    @Test
    void onlyMarkedDefiniteBusinessRejectionCanFinishTheCommand() {
        missing();
        server.expect(requestTo("/api/credits/orders/order/reservation"))
                .andRespond(withStatus(HttpStatus.CONFLICT).contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "K").header("Command-Outcome", "REJECTED")
                        .body("{\"error\":\"INSUFFICIENT_CREDITS\"}"));
        assertEquals("INSUFFICIENT_CREDITS", gateway.execute("K", mutation("CREATE"), 1, "Bearer token").code());
        server.verify();
    }

    @ParameterizedTest
    @CsvSource({"409,STALE_COMMAND_GENERATION", "400,VALIDATION_ERROR", "404,ACCOUNT_NOT_FOUND"})
    void unmarkedFailuresRetainUncertainty(int status, String code) {
        missing();
        server.expect(requestTo("/api/credits/orders/order/reservation"))
                .andRespond(withStatus(org.springframework.http.HttpStatusCode.valueOf(status))
                        .contentType(MediaType.APPLICATION_JSON).body("{\"error\":\"" + code + "\"}"));
        assertEquals("SERVICE_UNAVAILABLE", assertThrows(OrderProblem.class,
                () -> gateway.execute("K", mutation("CREATE"), 1, "Bearer token")).getCode());
        server.verify();
    }

    @ParameterizedTest
    @CsvSource({"commandId,foreign", "orderId,foreign", "operation,ASSIGN_COURIER", "outcome,UNKNOWN", "code,UNKNOWN"})
    void rejectsForeignOrUnconfirmedHistoricalResults(String field, String value) {
        String body = result("RESERVE", "APPLIED", "SUCCEEDED")
                .replaceAll("\"" + field + "\":\"[^\"]+\"", "\"" + field + "\":\"" + value + "\"");
        server.expect(requestTo("/api/credits/commands/K")).andRespond(saved(body, "APPLIED"));
        assertThrows(OrderProblem.class, () -> gateway.execute("K", mutation("CREATE"), 1, "Bearer token"));
        server.verify();
    }

    @Test
    void missingSuccessHeadersAndTimeoutRemainUnresolved() {
        missing();
        server.expect(requestTo("/api/credits/orders/order/reservation")).andRespond(withSuccess());
        server.expect(requestTo("/api/credits/commands/K")).andRespond(withException(new IOException("timeout")));
        assertThrows(OrderProblem.class, () -> gateway.execute("K", mutation("CREATE"), 1, "Bearer token"));
        assertThrows(OrderProblem.class, () -> gateway.execute("K", mutation("CREATE"), 2, "Bearer token"));
        server.verify();
    }

    @Test
    void compensationUsesOnlyOriginalKeyAndAcceptsConfirmedReversal() {
        server.expect(requestTo("/api/credits/commands/K"))
                .andRespond(saved(result("ASSIGN_COURIER", "APPLIED", "SUCCEEDED"), "APPLIED"));
        server.expect(requestTo("/api/credits/commands/K/compensate"))
                .andExpect(method(HttpMethod.POST)).andExpect(content().string(""))
                .andExpect(header("Idempotency-Key", "K")).andExpect(header("X-Command-Generation", "4"))
                .andRespond(saved(result("ASSIGN_COURIER", "COMPENSATED", "REVERSED"), "COMPENSATED"));
        assertTrue(gateway.compensate("K", mutation("ACCEPT"), 4, "Bearer token"));
        server.verify();
    }

    @Test
    void missingBindingIsNotProofOfNoEffectAndIsEstablishedBeforeFencing() {
        missing();
        server.expect(requestTo("/api/credits/orders/order/reservation"))
                .andRespond(withStatus(HttpStatus.CREATED).header("Idempotency-Key", "K")
                        .header("Command-Outcome", "APPLIED"));
        server.expect(requestTo("/api/credits/commands/K/compensate"))
                .andRespond(saved(result("RESERVE", "COMPENSATED", "REVERSED"), "COMPENSATED"));
        assertTrue(gateway.compensate("K", mutation("CREATE"), 4, "Bearer token"));
        server.verify();
    }

    @Test
    void unsafeCompensationKeepsReconciliationPending() {
        server.expect(requestTo("/api/credits/commands/K"))
                .andRespond(saved(result("CLEAR_COURIER", "APPLIED", "SUCCEEDED"), "APPLIED"));
        server.expect(requestTo("/api/credits/commands/K/compensate"))
                .andRespond(withStatus(HttpStatus.CONFLICT).contentType(MediaType.APPLICATION_JSON)
                        .body("{\"error\":\"RECONCILIATION_REQUIRED\"}"));
        assertFalse(gateway.compensate("K", mutation("ABORT"), 4, "Bearer token"));
        server.verify();
    }

    @Test
    void missingAuthorizationNeverContactsCredit() {
        assertEquals("UNAUTHENTICATED", assertThrows(OrderProblem.class,
                () -> gateway.execute("K", mutation("CREATE"), 1, null)).getCode());
        server.verify();
    }
}
