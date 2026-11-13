package sg.edu.nus.foc.order.adapter.dto;

/** Credit-owned historical result. Business input remains in Order's saved command. */
public record CreditCommandResponse(String commandId, String operation, String orderId,
                                    String outcome, String code) {
}
