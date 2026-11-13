/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-27
 * Mode: Code generation and implementation assistance.
 * Scope: Generated the Credit compensation workflow implementation from the approved cross-service contract.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.credit.messaging;

import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import sg.edu.nus.foc.credit.persistence.CreditCompensationStore;

@Service
public class CreditCompensationService {

    private static final Logger log = LoggerFactory.getLogger(CreditCompensationService.class);

    private final CreditCompensationStore store;
    private final ApplicationEventPublisher events;
    private final MeterRegistry metrics;

    public CreditCompensationService(CreditCompensationStore store,
                                     ApplicationEventPublisher events,
                                     MeterRegistry metrics) {
        this.store = store;
        this.events = events;
        this.metrics = metrics;
    }

    public CreditCompensationStore.Processed process(CreditCompensationRequest request) {
        CreditCompensationStore.Processed processed = store.process(request);
        metrics.counter("credit.compensation.requests", "outcome",
                processed.result().outcome()).increment();
        if ("RECONCILIATION_REQUIRED".equals(processed.result().outcome())) {
            metrics.counter("credit.compensation.reconciliation", "code",
                    processed.result().code()).increment();
        }
        log.atInfo()
                .addKeyValue("service", "credit-service")
                .addKeyValue("compensationId", request.eventId())
                .addKeyValue("commandId", request.commandId())
                .addKeyValue("orderId", request.orderId())
                .addKeyValue("outcome", processed.result().outcome())
                .addKeyValue("code", processed.result().code())
                .addKeyValue("replayed", processed.replayed())
                .log("credit_compensation_committed");
        events.publishEvent(new CompensationResultDispatchRequested(processed.resultEventId()));
        return processed;
    }
}
