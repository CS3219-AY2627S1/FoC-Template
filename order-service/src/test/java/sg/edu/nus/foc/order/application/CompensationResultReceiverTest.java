package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.Base64;
import java.util.Map;
import org.junit.jupiter.api.Test;
import sg.edu.nus.foc.order.api.CreditCompensationResultController;
import sg.edu.nus.foc.order.application.recovery.OrderCompensationJournal;
import sg.edu.nus.foc.order.config.CompensationTransportSettings;
import sg.edu.nus.foc.order.domain.OrderProblem;
import tools.jackson.databind.json.JsonMapper;

class CompensationResultReceiverTest {
    private final OrderCompensationJournal journal = mock(OrderCompensationJournal.class);
    private final CompensationTransportSettings settings = new CompensationTransportSettings(
            "requests", "results", "emulator", "", "", "demo-local",
            "emulator", "localhost:8085", "local", "demo-auth", "localhost:9099");
    private final CreditCompensationResultController receiver =
            new CreditCompensationResultController(journal, JsonMapper.builder().build(), settings);

    @Test void validEnvelopeCommitsBeforeAcknowledgingAndStorageFailureIsNotAcknowledged() {
        CreditCompensationResultController.Envelope envelope = envelope(settings.subscriptionPath(), payload(), "1");
        assertEquals(204, receiver.receive(envelope).getStatusCode().value());
        verify(journal).accept(any());
        doThrow(new IllegalStateException("commit failed")).when(journal).accept(any());
        assertThrows(IllegalStateException.class, () -> receiver.receive(envelope));
    }
    @Test void wrongSubscriptionVersionAndMalformedDataNeverReachJournal() {
        assertThrows(OrderProblem.class, () -> receiver.receive(envelope("wrong", payload(), "1")));
        assertThrows(OrderProblem.class, () -> receiver.receive(envelope(settings.subscriptionPath(), payload(), "2")));
        assertThrows(OrderProblem.class, () -> receiver.receive(envelope(settings.subscriptionPath(), "not-json", "1")));
        assertThrows(OrderProblem.class, () -> receiver.receive(null));
        verifyNoInteractions(journal);
    }
    private static CreditCompensationResultController.Envelope envelope(String subscription, String json, String version) {
        return new CreditCompensationResultController.Envelope(subscription,
                new CreditCompensationResultController.Message(Base64.getEncoder().encodeToString(
                        json.getBytes(java.nio.charset.StandardCharsets.UTF_8)),
                        Map.of("eventType", "CreditCompensationResult", "eventVersion", version)));
    }
    private static String payload() {
        return """
                {"eventId":"11111111-1111-4111-8111-111111111111",
                 "compensationId":"22222222-2222-4222-8222-222222222222",
                 "commandId":"K","operation":"RESERVE","orderId":"O",
                 "generation":2,"outcome":"COMPENSATED","code":"REVERSED"}
                """;
    }
}
