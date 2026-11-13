package sg.edu.nus.foc.credit.credit;

public record CommandMutationResult<T>(T value, CreditCommandResult command, boolean replayed) {
}
