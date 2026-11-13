/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-26
 * Mode: Code generation.
 * Scope: Generated the user event decoder to handle the user service pub/sub events based on the provided requirements contract.
 * Author review: I reviewed for correctness and edited where needed.
 */

package sg.edu.nus.foc.credit.messaging;

import java.util.Map;

@FunctionalInterface
public interface UserCreatedEventPayloadDecoder {
    UserCreatedEventMessage decode(String subscription, String payload,
                                   Map<String, String> attributes,
                                   String expectedSubscription);
}
