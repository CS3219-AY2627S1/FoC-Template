package com.cs3219.foc.user.model.dto;

import java.time.OffsetDateTime;

public record AuthTokens(String accessToken, String refreshToken, OffsetDateTime accessTokenExpiresAt) {}
