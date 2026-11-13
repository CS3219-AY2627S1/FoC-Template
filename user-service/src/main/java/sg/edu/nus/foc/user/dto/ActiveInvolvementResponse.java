package sg.edu.nus.foc.user.dto;

public record ActiveInvolvementResponse(
        String userId,
        boolean hasActiveOrders
) {}