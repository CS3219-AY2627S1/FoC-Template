package com.cs3219.foc.order.model.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.UUID;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ErrorResponse(String code, String message, UUID errandId) {
    public ErrorResponse(String code, String message) {
        this(code, message, null);
    }
}
