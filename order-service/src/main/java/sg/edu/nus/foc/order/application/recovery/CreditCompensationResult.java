package sg.edu.nus.foc.order.application.recovery;

/** Only the separately authenticated broker receiver may supply this committed result. */
public record CreditCompensationResult(String eventId, String compensationId, String commandId,
        String operation, String orderId, long generation, String outcome, String code) { }
