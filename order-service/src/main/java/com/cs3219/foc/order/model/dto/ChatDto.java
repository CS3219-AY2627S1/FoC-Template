package com.cs3219.foc.order.model.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

// An errand's conversation, oldest first, and how far each person has read it
public record ChatDto(List<ErrandMessageDto> messages, List<Read> reads) {
    public record Read(UUID userId, OffsetDateTime lastReadAt) {}
}
