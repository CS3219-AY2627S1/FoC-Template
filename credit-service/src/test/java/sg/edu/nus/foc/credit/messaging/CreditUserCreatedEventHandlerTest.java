/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-26
 * Mode: Code generation.
 * Scope: Generated the event handler tests to handle the user service pub/sub events based on the provided requirements contract.
 * Author review: I reviewed for correctness and edited where needed.
 */

package sg.edu.nus.foc.credit.messaging;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import sg.edu.nus.foc.credit.credit.CreditService;

class CreditUserCreatedEventHandlerTest {

    @Test
    void initializesCreditAccountFromUserCreatedFact() {
        CreditService service = mock(CreditService.class);
        CreditUserCreatedEventHandler handler = new CreditUserCreatedEventHandler(service);
        UUID eventId = UUID.fromString("c91e4571-329a-4399-b87f-a756a6ab7243");
        Instant occurredAt = Instant.parse("2026-10-25T08:00:00Z");

        handler.handle(new UserCreatedEventMessage(
                eventId, "user-1", "user@u.nus.edu", occurredAt, 1));

        verify(service).initializeAccount(eventId, "user-1", occurredAt);
    }

    @Test
    void propagatesInitializationFailureForBrokerRetry() {
        CreditService service = mock(CreditService.class);
        CreditUserCreatedEventHandler handler = new CreditUserCreatedEventHandler(service);
        UUID eventId = UUID.fromString("c91e4571-329a-4399-b87f-a756a6ab7243");
        Instant occurredAt = Instant.parse("2026-10-25T08:00:00Z");
        doThrow(new IllegalStateException("database unavailable"))
                .when(service).initializeAccount(eventId, "user-1", occurredAt);

        assertThatThrownBy(() -> handler.handle(new UserCreatedEventMessage(
                eventId, "user-1", "user@u.nus.edu", occurredAt, 1)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("database unavailable");
    }
}
