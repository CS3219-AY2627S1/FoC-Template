package com.cs3219.foc.user.model.dto.event;

import java.util.UUID;

public record PasswordResetCompletedEvent(UUID userId, String email) {}
