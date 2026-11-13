package com.cs3219.foc.order.infrastructure.client;

import static org.assertj.core.api.Assertions.*;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.cs3219.foc.order.config.ErrandAiProperties;
import com.cs3219.foc.order.exception.ErrandAiException;
import com.cs3219.foc.order.model.dto.AiChatRequest;
import com.cs3219.foc.order.model.dto.ErrandDraftDto;
import com.openai.client.okhttp.OpenAIOkHttpClient;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.slf4j.LoggerFactory;
import tools.jackson.databind.json.JsonMapper;

class OpenAiGatewayTests {
    private final JsonMapper mapper = JsonMapper.builder().build();
    private HttpServer server;
    private OpenAiGateway gateway;
    private volatile int status = 200;
    private volatile String body;
    private volatile long responseDelay;
    private final Logger logger = (Logger) LoggerFactory.getLogger(OpenAiGateway.class);
    private final ListAppender<ILoggingEvent> logs = new ListAppender<>();
    private final AtomicInteger calls = new AtomicInteger();
    private final AtomicReference<String> request = new AtomicReference<>();
    private final AtomicReference<String> path = new AtomicReference<>();
    private final AiChatRequest input = new AiChatRequest(
            "Coffee",
            List.of(new AiChatRequest.Message("assistant", "Where?")),
            new ErrandDraftDto(null, null, null, "", 5L, 60),
            null);

    @BeforeEach
    void start() throws Exception {
        logs.start();
        logger.addAppender(logs);
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            try (exchange) {
                calls.incrementAndGet();
                path.set(exchange.getRequestURI().getPath());
                request.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                if (responseDelay > 0) {
                    try {
                        Thread.sleep(responseDelay);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        return;
                    }
                }
                var bytes = body.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.getResponseHeaders().set("x-request-id", "req_test123");
                exchange.sendResponseHeaders(status, bytes.length);
                exchange.getResponseBody().write(bytes);
            }
        });
        server.start();
        var props = new ErrandAiProperties(
                true, "test-only", "test-model", "test-transcribe", Duration.ofSeconds(2), 8388608);
        gateway = new OpenAiGateway(
                props,
                mapper,
                OpenAIOkHttpClient.builder()
                        .apiKey("test-only")
                        .baseUrl("http://127.0.0.1:" + server.getAddress().getPort() + "/v1")
                        .timeout(props.timeout())
                        .maxRetries(0)
                        .build());
    }

    @AfterEach
    void stop() {
        logger.detachAppender(logs);
        logs.stop();
        gateway.close();
        server.stop(0);
    }

    private String response(String contentType, String text, String state) {
        var content = contentType.equals("refusal")
                ? Map.of("type", "refusal", "refusal", text)
                : Map.of("type", "output_text", "text", text, "annotations", List.of());
        return """
                {"id":"resp_test","object":"response","created_at":0,"model":"test-model",
                 "status":%s,"parallel_tool_calls":false,"tool_choice":"auto","tools":[],
                 "output":[{"type":"message","id":"msg_test","role":"assistant",
                 "status":"completed","content":[%s]}]}
                """.formatted(mapper.writeValueAsString(state), mapper.writeValueAsString(content));
    }

    @Test
    void usesStatelessStrictResponsesAndParsesPartialDrafts() {
        body = response("output_text", """
                {"message":"Where should it go?","draft":{"supplierId":null,"deliveryLocation":null,
                 "description":"Coffee","notes":"","creditReward":5,"expiryMinutes":60},"supplierChoiceIds":[]}
                """, "completed");
        assertThat(gateway.chat(input, List.of()).draft().description()).isEqualTo("Coffee");
        var json = mapper.readTree(request.get());
        assertThat(path.get()).isEqualTo("/v1/responses");
        assertThat(json.get("store").asBoolean()).isFalse();
        assertThat(json.at("/text/format/type").asText()).isEqualTo("json_schema");
        assertThat(json.at("/text/format/strict").asBoolean()).isTrue();
        assertThat(json.at("/text/format/schema/additionalProperties").asBoolean())
                .isFalse();
        assertThat(json.has("previous_response_id")).isFalse();
        assertThat(json.get("input").asText()).contains("Coffee", "Where?", "activeSuppliers");
        assertThat(json.get("instructions").asText()).isNotBlank();
    }

    @Test
    void audioHasActualFilenameContentTypeAndOnlyUsesTranscription() {
        body = "{\"text\":\"Coffee to COM3\"}";
        assertThat(gateway.transcribe(new byte[] {1, 2, 3}, "recording.mp4", "audio/mp4"))
                .isEqualTo("Coffee to COM3");
        assertThat(path.get()).isEqualTo("/v1/audio/transcriptions");
        assertThat(request.get()).contains("recording.mp4", "audio/mp4", "test-transcribe");
        assertThat(calls.get()).isEqualTo(1);
    }

    @Test
    void refusesRefusalsTruncatedAndMalformedOutput() {
        body = response("refusal", "Cannot help", "completed");
        assertThatThrownBy(() -> gateway.chat(input, List.of()))
                .isInstanceOf(ErrandAiException.class)
                .extracting("code")
                .isEqualTo("AI_REFUSED");
        body = response("output_text", "{}", "incomplete");
        assertThatThrownBy(() -> gateway.chat(input, List.of())).isInstanceOf(ErrandAiException.class);
        body = response("output_text", "{", "completed");
        assertThatThrownBy(() -> gateway.chat(input, List.of())).isInstanceOf(ErrandAiException.class);
    }

    @ParameterizedTest
    @ValueSource(ints = {429, 500, 401})
    void upstreamErrorsAreSafeAndNeverAutomaticallyRetried(int errorStatus) {
        status = errorStatus;
        body = "{\"error\":{\"message\":\"secret upstream detail\",\"type\":\"test_error\"}}";
        String category = errorStatus == 429 ? "AI_RATE_LIMITED" : "AI_UPSTREAM_ERROR";
        assertThatExceptionOfType(ErrandAiException.class)
                .isThrownBy(() -> gateway.chat(input, List.of()))
                .satisfies(e -> assertThat(e.getCode()).isEqualTo(category))
                .withMessageNotContaining("secret upstream detail");
        assertFailureLog("chat", category, errorStatus, "req_test123");
        assertThat(calls.get()).isEqualTo(1);
    }

    @Test
    void transcriptionFailureLogsOnlyDiagnostics() {
        status = 403;
        body = "{\"error\":{\"message\":\"secret upstream detail\"}}";
        assertThatThrownBy(() -> gateway.transcribe(
                        "private audio".getBytes(StandardCharsets.UTF_8), "private-clip.mp4", "audio/mp4"))
                .isInstanceOf(ErrandAiException.class)
                .extracting("code")
                .isEqualTo("AI_UPSTREAM_ERROR");
        assertFailureLog("transcription", "AI_UPSTREAM_ERROR", 403, "req_test123");
        assertThat(calls.get()).isEqualTo(1);
    }

    private void assertFailureLog(String operation, String category, Integer status, String requestId) {
        var messages =
                logs.list.stream().map(ILoggingEvent::getFormattedMessage).toList();
        assertThat(messages).anySatisfy(message -> assertThat(message)
                .contains(
                        "operation=" + operation,
                        "category=" + category,
                        "status=" + status,
                        "requestId=" + requestId));
        assertThat(messages).allSatisfy(message -> assertThat(message)
                .doesNotContain(
                        "test-only",
                        "Coffee",
                        "Where?",
                        "secret upstream detail",
                        "private audio",
                        "private-clip.mp4"));
        assertThat(logs.list)
                .allSatisfy(event -> assertThat(event.getThrowableProxy()).isNull());
    }

    @Test
    void disabledAiRejectsChatWithoutCallingUpstream() throws Exception {
        var disabled =
                new OpenAiGateway(new ErrandAiProperties(false, "", "", "", Duration.ofSeconds(30), 8388608), mapper);
        assertThatThrownBy(() -> disabled.chat(input, List.of()))
                .isInstanceOf(ErrandAiException.class)
                .extracting("code")
                .isEqualTo("AI_UNAVAILABLE");
        disabled.close();
        assertThat(calls.get()).isZero();
    }

    @Test
    void slowUpstreamTimesOutWithoutRetrying() {
        responseDelay = 3000;
        body = "{}";
        assertThatThrownBy(() -> gateway.chat(input, List.of()))
                .isInstanceOf(ErrandAiException.class)
                .extracting("code")
                .isEqualTo("AI_TIMEOUT");
        assertFailureLog("chat", "AI_TIMEOUT", null, null);
        assertThat(calls.get()).isEqualTo(1);
    }
}
