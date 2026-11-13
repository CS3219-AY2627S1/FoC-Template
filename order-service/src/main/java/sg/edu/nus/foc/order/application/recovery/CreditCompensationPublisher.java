package sg.edu.nus.foc.order.application.recovery;

/** Durable outbox transport boundary; actual Pub/Sub adapter is opt-in under ADR-055. */
public interface CreditCompensationPublisher {
    void publish(CreditCompensationRequest request);
}
