/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-26
 * Mode: Code generation.
 * Scope: Generated the Handler to handle the user service pub/sub events based on the provided requirements contract.
 * Author review: I reviewed for correctness and edited where needed.
 */

package sg.edu.nus.foc.credit.messaging;

import org.springframework.stereotype.Component;
import sg.edu.nus.foc.credit.credit.CreditService;

@Component
public class CreditUserCreatedEventHandler implements UserCreatedEventHandler {

    private final CreditService creditService;

    public CreditUserCreatedEventHandler(CreditService creditService) {
        this.creditService = creditService;
    }

    @Override
    public void handle(UserCreatedEventMessage message) {
        creditService.initializeAccount(message.eventId(), message.userId(), message.occurredAt());
    }
}
