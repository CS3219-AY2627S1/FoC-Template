package com.cs3219.foc.order.model.dto;

import com.cs3219.foc.order.model.entity.DisputeDecision;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ResolveDisputeRequest(
        @NotNull DisputeDecision decision,
        @NotBlank @Size(max = 2000) String explanation) {}
