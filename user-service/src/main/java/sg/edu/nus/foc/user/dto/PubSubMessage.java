package sg.edu.nus.foc.user.dto;

import java.util.Map;

public record PubSubMessage(
    String data,
    Map<String, String> attributes,
    String messageId,
    String publishTime
) {}
