package com.cs3219.foc.user.model.dto;

import java.time.OffsetDateTime;
import java.util.List;

public record UserDto(
        String id,
        String email,
        String name,
        List<String> roles,
        String phoneNumber,
        String faculty,
        String avatarUrl,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt) {}
