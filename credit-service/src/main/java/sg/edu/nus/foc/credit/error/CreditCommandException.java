package sg.edu.nus.foc.credit.error;

import sg.edu.nus.foc.credit.credit.CreditCommandOutcome;

public class CreditCommandException extends RuntimeException {

    private final ErrorCode errorCode;
    private final String commandId;
    private final CreditCommandOutcome outcome;

    public CreditCommandException(ErrorCode errorCode, String message, String commandId,
                                  CreditCommandOutcome outcome) {
        super(message);
        this.errorCode = errorCode;
        this.commandId = commandId;
        this.outcome = outcome;
    }

    public ErrorCode errorCode() {
        return errorCode;
    }

    public String commandId() {
        return commandId;
    }

    public CreditCommandOutcome outcome() {
        return outcome;
    }
}
