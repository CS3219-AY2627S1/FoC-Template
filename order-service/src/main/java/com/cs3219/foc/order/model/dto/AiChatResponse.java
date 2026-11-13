package com.cs3219.foc.order.model.dto;

import java.util.List;

public record AiChatResponse(
        String message,
        ErrandDraftDto draft,
        List<String> missingFields,
        List<ErrandDraftDto.Pickup> supplierChoices) {}
