package com.cs3219.foc.credit.infrastructure.messaging.consumer;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.cs3219.foc.credit.exception.ValidationFailedException;
import com.cs3219.foc.credit.infrastructure.messaging.EventValidator;
import com.cs3219.foc.credit.model.dto.event.ErrandCancelledEvent;
import com.cs3219.foc.credit.model.dto.event.ErrandCompletedEvent;
import com.cs3219.foc.credit.model.dto.event.ErrandExpiredEvent;
import com.cs3219.foc.credit.model.dto.event.UserCreatedEvent;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.validation.FieldError;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.exc.MismatchedInputException;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

class SqsCreditEventConsumerTests {
    private final UserCreatedConsumer userCreatedConsumer = mock(UserCreatedConsumer.class);
    private final ErrandPaymentConsumer errandPaymentConsumer = mock(ErrandPaymentConsumer.class);
    private final ErrandRefundConsumer errandRefundConsumer = mock(ErrandRefundConsumer.class);
    private static final ObjectMapper objectMapper = JsonMapper.builder().build();
    private final LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
    private SqsCreditEventConsumer consumer;

    @BeforeEach
    void setUp() {
        validator.afterPropertiesSet();
        consumer = new SqsCreditEventConsumer(
                objectMapper,
                new EventValidator(validator),
                userCreatedConsumer,
                errandPaymentConsumer,
                errandRefundConsumer);
    }

    @AfterEach
    void closeValidator() {
        validator.close();
    }

    private static String contract(UUID courier) {
        var courierField = courier == null ? "" : ", \"courierId\": \"" + courier + "\"";
        return """
                {
                  "eventId": "00000000-0000-0000-0000-000000000001",
                  "schemaVersion": 1,
                  "occurredAt": "2026-10-18T01:00:00Z",
                  "payload": {
                    "errandId": "00000000-0000-0000-0000-000000000004",
                    "requesterId": "00000000-0000-0000-0000-000000000005",
                    "amount": 80%s
                  }
                }
                """.formatted(courierField);
    }

    @Test
    void userCreatedInitializesTheAccount() {
        var body = """
                {
                  "eventId": "00000000-0000-0000-0000-000000000001",
                  "schemaVersion": 1,
                  "occurredAt": "2026-10-18T01:00:00Z",
                  "payload": { "userId": "00000000-0000-0000-0000-000000000002" }
                }
                """;
        var event = objectMapper.readValue(body, UserCreatedEvent.class);
        consumer.consume(UserCreatedEvent.TYPE, body);
        verify(userCreatedConsumer).initializeAccount(event);
    }

    @Test
    void cancellationRoutesToRelease() {
        var body = contract(null);
        var event = objectMapper.readValue(body, ErrandCancelledEvent.class);
        consumer.consume(ErrandCancelledEvent.TYPE, body);
        verify(errandRefundConsumer).releaseReservedCredits(event);
    }

    @Test
    void expiryRoutesToRelease() {
        var body = contract(null);
        var event = objectMapper.readValue(body, ErrandExpiredEvent.class);
        consumer.consume(ErrandExpiredEvent.TYPE, body);
        verify(errandRefundConsumer).releaseReservedCredits(event);
    }

    @Test
    void completionRoutesToTransfer() {
        var body = contract(UUID.randomUUID());
        var event = objectMapper.readValue(body, ErrandCompletedEvent.class);
        consumer.consume(ErrandCompletedEvent.TYPE, body);
        verify(errandPaymentConsumer).transferReservedCredits(event);
    }

    @Test
    void handlerFailurePropagates() {
        var body = contract(null);
        var event = objectMapper.readValue(body, ErrandCancelledEvent.class);
        var failure = new IllegalStateException("database unavailable");
        doThrow(failure).when(errandRefundConsumer).releaseReservedCredits(event);
        assertThatThrownBy(() -> consumer.consume(ErrandCancelledEvent.TYPE, body))
                .isSameAs(failure);
    }

    @Test
    void unexpectedEventTypeFails() {
        assertThatThrownBy(() -> consumer.consume("SomethingElse", "{}")).isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest
    @MethodSource("invalidEvents")
    void invalidEventDoesNotReachHandlers(String eventType, String body, String field) {
        assertThatThrownBy(() -> consumer.consume(eventType, body))
                .isInstanceOfSatisfying(ValidationFailedException.class, exception -> {
                    assertThat(exception.getMessage()).isEqualTo("Event validation failed");
                    assertThat(exception.getValidationErrors().getFieldErrors())
                            .extracting(FieldError::getField)
                            .contains(field);
                });
        verifyNoInteractions(userCreatedConsumer, errandPaymentConsumer, errandRefundConsumer);
    }

    private static Stream<Arguments> invalidEvents() {
        return Stream.of(
                        UserCreatedEvent.TYPE,
                        ErrandCancelledEvent.TYPE,
                        ErrandExpiredEvent.TYPE,
                        ErrandCompletedEvent.TYPE)
                .flatMap(eventType -> {
                    var event = (ObjectNode) objectMapper.readTree(
                            contract(eventType.equals(ErrandCompletedEvent.TYPE) ? UUID.randomUUID() : null));
                    if (eventType.equals(UserCreatedEvent.TYPE)) {
                        event.set(
                                "payload",
                                objectMapper
                                        .createObjectNode()
                                        .put("userId", UUID.randomUUID().toString()));
                    }
                    var cases = new ArrayList<Arguments>();
                    for (var field : List.of("eventId", "occurredAt", "payload")) {
                        var missing = event.deepCopy();
                        missing.remove(field);
                        cases.add(Arguments.of(eventType, missing.toString(), field));
                        var nullValue = event.deepCopy();
                        nullValue.putNull(field);
                        cases.add(Arguments.of(eventType, nullValue.toString(), field));
                    }
                    for (var version : List.of(-1, 0, 2)) {
                        cases.add(Arguments.of(
                                eventType,
                                event.deepCopy().put("schemaVersion", version).toString(),
                                "schemaVersion"));
                    }
                    var payload = (ObjectNode) event.get("payload");
                    for (var field : payload.propertyNames()) {
                        if (field.equals("amount")) continue;
                        var missing = event.deepCopy();
                        ((ObjectNode) missing.get("payload")).remove(field);
                        cases.add(Arguments.of(eventType, missing.toString(), "payload." + field));
                        var nullValue = event.deepCopy();
                        ((ObjectNode) nullValue.get("payload")).putNull(field);
                        cases.add(Arguments.of(eventType, nullValue.toString(), "payload." + field));
                    }
                    if (!eventType.equals(UserCreatedEvent.TYPE)) {
                        for (var amount : List.of(0, -1)) {
                            var invalidAmount = event.deepCopy();
                            ((ObjectNode) invalidAmount.get("payload")).put("amount", amount);
                            cases.add(Arguments.of(eventType, invalidAmount.toString(), "payload.amount"));
                        }
                    }
                    return cases.stream();
                });
    }

    @ParameterizedTest
    @ValueSource(strings = {ErrandCancelledEvent.TYPE, ErrandExpiredEvent.TYPE, ErrandCompletedEvent.TYPE})
    void missingOrNullAmountDoesNotReachHandlers(String eventType) {
        var event = (ObjectNode) objectMapper.readTree(contract(UUID.randomUUID()));
        var payload = (ObjectNode) event.get("payload");
        payload.remove("amount");
        assertThatThrownBy(() -> consumer.consume(eventType, event.toString()))
                .isInstanceOf(MismatchedInputException.class);
        payload.putNull("amount");
        assertThatThrownBy(() -> consumer.consume(eventType, event.toString()))
                .isInstanceOf(MismatchedInputException.class);
        verifyNoInteractions(userCreatedConsumer, errandPaymentConsumer, errandRefundConsumer);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "null",
                "{",
                "{}",
                "{\"schemaVersion\":null}",
                "{\"eventId\":\"invalid-uuid\",\"schemaVersion\":1}"
            })
    void unreadableEventDoesNotReachHandlers(String body) {
        assertThatThrownBy(() -> consumer.consume(UserCreatedEvent.TYPE, body)).isInstanceOf(RuntimeException.class);
        verifyNoInteractions(userCreatedConsumer, errandPaymentConsumer, errandRefundConsumer);
    }
}
