package com.cs3219.foc.user.model.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public record RefreshTokenDto(String value, UUID userId, OffsetDateTime expiresAt) {}
