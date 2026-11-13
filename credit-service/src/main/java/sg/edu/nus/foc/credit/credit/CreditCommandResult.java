package sg.edu.nus.foc.credit.credit;

public record CreditCommandResult(
        String commandId,
        CreditCommandOperation operation,
        String orderId,
        CreditCommandOutcome outcome,
        String code) {
}
