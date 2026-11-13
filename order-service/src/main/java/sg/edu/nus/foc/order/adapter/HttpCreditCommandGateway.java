package sg.edu.nus.foc.order.adapter;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import tools.jackson.databind.json.JsonMapper;
import sg.edu.nus.foc.order.adapter.dto.CreditCommandResponse;
import sg.edu.nus.foc.order.application.recovery.CreditCommandGateway;
import sg.edu.nus.foc.order.domain.OrderProblem;

/** ADR-035: historical results, same-key mutations and conditional compensation. */
@Component
@ConditionalOnProperty(name = "order.peers.mode", havingValue = "http")
public class HttpCreditCommandGateway implements CreditCommandGateway {
    private final RestClient credit;
    private final JsonMapper json = JsonMapper.builder().build();

    @Autowired
    public HttpCreditCommandGateway(@Value("${order.peers.credit-url}") String url,
            @Value("${order.peers.connect-timeout:3s}") Duration connectTimeout,
            @Value("${order.peers.read-timeout:5s}") Duration readTimeout) {
        this(client(url, connectTimeout, readTimeout));
    }

    HttpCreditCommandGateway(RestClient credit) {
        this.credit = credit;
    }

    static RestClient client(String url, Duration connectTimeout, Duration readTimeout) {
        if (connectTimeout.isNegative() || connectTimeout.isZero()
                || readTimeout.isNegative() || readTimeout.isZero()) {
            throw new IllegalArgumentException("Peer timeouts must be positive.");
        }
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(connectTimeout);
        factory.setReadTimeout(readTimeout);
        return RestClient.builder().baseUrl(url).requestFactory(factory).build();
    }

    @Override
    public Result execute(String key, Mutation mutation, long generation, String authorization) {
        if ("AUTO_REPOST".equals(mutation.kind())) {
            ResponseEntity<String> response = request(HttpMethod.PUT,
                    "/api/credits/internal/automatic-reposts/{id}/reservation", mutation.orderId(),
                    null, key, generation, Map.of("requesterId", mutation.actorId(), "amount", mutation.amount()));
            String outcome = response.getHeaders().getFirst("Command-Outcome");
            if (key.equals(response.getHeaders().getFirst("Idempotency-Key"))
                    && response.getStatusCode().is4xxClientError()
                    && ("REJECTED".equals(outcome) || "COMPENSATED".equals(outcome))) {
                String code = error(response);
                if (code == null || code.isBlank()) throw uncertain();
                return Result.rejection(code);
            }
            checkAttempt(response);
            requireHeaders(response, key, "APPLIED");
            return Result.success();
        }
        String token = token(authorization);
        Optional<CreditCommandResponse> saved = lookup(key, mutation, token);
        if (saved.isPresent() && !"PENDING".equals(saved.get().outcome())) {
            return result(saved.get());
        }
        return mutate(key, mutation, generation, token);
    }

    @Override
    public boolean compensate(String key, Mutation mutation, long generation, String authorization) {
        String token = token(authorization);
        Optional<CreditCommandResponse> saved = lookup(key, mutation, token);
        if (saved.isPresent() && "COMPENSATED".equals(saved.get().outcome())) {
            return true;
        }
        if (saved.isEmpty()) {
            // A missing result cannot fence an older in-flight execute. Establish
            // the SAME immutable binding, then reverse/fence it; never a fresh K.
            mutate(key, mutation, generation, token);
        }
        ResponseEntity<String> response = request(HttpMethod.POST,
                "/api/credits/commands/{key}/compensate", key, token, key, generation, null);
        if (response.getStatusCode().value() == 409 && "RECONCILIATION_REQUIRED".equals(error(response))) {
            return false;
        }
        checkAttempt(response);
        CreditCommandResponse confirmed = historical(response, key, mutation);
        requireHeaders(response, key, "COMPENSATED");
        if (!"COMPENSATED".equals(confirmed.outcome())) {
            throw uncertain();
        }
        return true;
    }

    private Optional<CreditCommandResponse> lookup(String key, Mutation mutation, String token) {
        ResponseEntity<String> response = request(HttpMethod.GET, "/api/credits/commands/{key}",
                key, token, null, 0, null);
        if (response.getStatusCode().value() == 404 && "COMMAND_NOT_FOUND".equals(error(response))) {
            return Optional.empty();
        }
        checkAttempt(response);
        return Optional.of(historical(response, key, mutation));
    }

    private Result mutate(String key, Mutation mutation, long generation, String token) {
        String suffix;
        HttpMethod method;
        Object body;
        switch (mutation.kind()) {
            case "CREATE" -> {
                suffix = "reservation";
                method = HttpMethod.PUT;
                body = Map.of("requesterId", mutation.actorId(), "amount", mutation.amount());
            }
            case "ACCEPT" -> {
                suffix = "courier-assignment";
                method = HttpMethod.PUT;
                body = Map.of("courierId", mutation.actorId());
            }
            case "ABORT" -> {
                suffix = "hold-for-reopen";
                method = HttpMethod.POST;
                body = null;
            }
            default -> throw new IllegalArgumentException("Unsupported Credit command operation.");
        }
        ResponseEntity<String> response = request(method, "/api/credits/orders/{id}/" + suffix,
                mutation.orderId(), token, key, generation, body);
        String outcome = response.getHeaders().getFirst("Command-Outcome");
        if (key.equals(response.getHeaders().getFirst("Idempotency-Key"))
                && response.getStatusCode().is4xxClientError()
                && ("REJECTED".equals(outcome) || "COMPENSATED".equals(outcome))) {
            String code = error(response);
            if (code == null || code.isBlank()) {
                throw uncertain();
            }
            return Result.rejection(code);
        }
        checkAttempt(response);
        int status = response.getStatusCode().value();
        if (status != 200 && !("CREATE".equals(mutation.kind()) && status == 201)) {
            throw uncertain();
        }
        requireHeaders(response, key, "APPLIED");
        return Result.success();
    }

    private ResponseEntity<String> request(HttpMethod method, String path, String pathId,
            String token, String key, long generation, Object body) {
        try {
            RestClient.RequestBodySpec request = credit.method(method).uri(path, pathId);
            if (token != null) request.header(HttpHeaders.AUTHORIZATION, token);
            if (key != null) {
                if (generation <= 0) {
                    throw new IllegalArgumentException("Command generation must be positive.");
                }
                request.header("Idempotency-Key", key)
                        .header("X-Command-Generation", Long.toString(generation));
            }
            if (body != null) {
                request.body(body);
            }
            return request.exchange((outbound, inbound) -> ResponseEntity.status(inbound.getStatusCode())
                    .headers(inbound.getHeaders())
                    .body(new String(inbound.getBody().readAllBytes(), StandardCharsets.UTF_8)));
        } catch (RestClientException failure) {
            throw uncertain();
        }
    }

    private CreditCommandResponse historical(ResponseEntity<String> response, String key, Mutation mutation) {
        try {
            CreditCommandResponse saved = json.readValue(response.getBody(), CreditCommandResponse.class);
            if (saved == null || !key.equals(saved.commandId()) || !mutation.orderId().equals(saved.orderId())
                    || !operation(mutation).equals(saved.operation()) || saved.code() == null || saved.code().isBlank()) {
                throw uncertain();
            }
            boolean valid = switch (saved.outcome() == null ? "" : saved.outcome()) {
                case "APPLIED" -> "SUCCEEDED".equals(saved.code()) && response.getStatusCode().value() == 200;
                case "REJECTED" -> response.getStatusCode().value() == 200;
                case "COMPENSATED" -> ("REVERSED".equals(saved.code()) || "FENCED_NO_EFFECT".equals(saved.code()))
                        && response.getStatusCode().value() == 200;
                case "PENDING" -> response.getStatusCode().value() == 202;
                default -> false;
            };
            if (!valid) {
                throw uncertain();
            }
            return saved;
        } catch (tools.jackson.core.JacksonException | IllegalArgumentException failure) {
            throw uncertain();
        }
    }

    private String error(ResponseEntity<String> response) {
        try {
            return json.readTree(response.getBody()).path("error").asString();
        } catch (RuntimeException failure) {
            return null;
        }
    }

    private static Result result(CreditCommandResponse saved) {
        return "APPLIED".equals(saved.outcome()) ? Result.success()
                : Result.rejection("COMPENSATED".equals(saved.outcome()) ? "COMMAND_COMPENSATED" : saved.code());
    }

    private static String operation(Mutation mutation) {
        return switch (mutation.kind()) {
            case "CREATE" -> "RESERVE";
            case "ACCEPT" -> "ASSIGN_COURIER";
            case "ABORT" -> "CLEAR_COURIER";
            default -> throw new IllegalArgumentException("Unsupported Credit command operation.");
        };
    }

    private static void checkAttempt(ResponseEntity<String> response) {
        if (response.getStatusCode().value() == 401) {
            throw new OrderProblem("UNAUTHENTICATED", "Fresh authorization is required to recover this request.");
        }
        if (response.getStatusCode().value() == 403) {
            throw OrderProblem.forbidden("Authorization is required to recover this request.");
        }
        if (!response.getStatusCode().is2xxSuccessful()) {
            throw uncertain();
        }
    }

    private static void requireHeaders(ResponseEntity<String> response, String key, String outcome) {
        if (!key.equals(response.getHeaders().getFirst("Idempotency-Key"))
                || !outcome.equals(response.getHeaders().getFirst("Command-Outcome"))) {
            throw uncertain();
        }
    }

    private static String token(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")
                || authorization.substring(7).isBlank()) {
            throw new OrderProblem("UNAUTHENTICATED", "Fresh authorization is required to recover this request.");
        }
        return authorization;
    }

    private static OrderProblem uncertain() {
        return new OrderProblem("SERVICE_UNAVAILABLE", "Credit has not confirmed this command's outcome.");
    }
}
