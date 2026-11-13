package com.cs3219.foc.order.model.dto;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

// The newest message the reader has seen
public record MarkReadRequest(@NotNull UUID messageId) {}
