package com.cs3219.foc.user.model.dto;

import java.util.List;

public record UserProfileDto(
        String id,
        String email,
        String name,
        List<String> roles,
        String phoneNumber,
        String faculty,
        String avatarUrl) {}
