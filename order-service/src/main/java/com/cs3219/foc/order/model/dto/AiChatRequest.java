package com.cs3219.foc.order.model.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;
import java.util.UUID;

public record AiChatRequest(
        @NotBlank @Size(max = 2000) String message,
        @NotNull @Size(max = 20) List<@NotNull @Valid Message> history,
        @NotNull @Valid ErrandDraftDto draft,
        UUID selectedSupplierId) {
    public static final int MAX_HISTORY_CHARACTERS = 20000;

    public record Message(
            @NotNull @Pattern(regexp = "user|assistant") String role,
            @NotBlank @Size(max = 2000) String content) {}
}
