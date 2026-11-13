package sg.edu.nus.foc.credit.credit;

@FunctionalInterface
public interface CreditOutcomeProcessor {
    void processOutcome(CreditOutcomeEvent event);
}
