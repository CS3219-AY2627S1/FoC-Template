package sg.edu.nus.foc.user.dto;

public record PubSubPushRequest(
    PubSubMessage message,
    String subscription
) {}
