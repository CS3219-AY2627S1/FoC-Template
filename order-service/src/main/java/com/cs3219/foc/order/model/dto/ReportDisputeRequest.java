package com.cs3219.foc.order.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ReportDisputeRequest(
        @NotBlank @Size(max = 2000) String complaint) {}
