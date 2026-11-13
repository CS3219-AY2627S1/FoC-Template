package com.cs3219.foc.credit.model.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.util.UUID;

public record ReserveCreditRequest(
        @NotNull UUID operationId,
        @NotNull UUID errandId,
        @Positive long amount) {}
