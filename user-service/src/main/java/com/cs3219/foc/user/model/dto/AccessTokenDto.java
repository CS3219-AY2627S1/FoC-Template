package com.cs3219.foc.user.model.dto;

import java.time.OffsetDateTime;

public record AccessTokenDto(String value, OffsetDateTime expiresAt) {}
