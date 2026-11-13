package com.cs3219.foc.user.model.dto;

import com.cs3219.foc.user.model.entity.UserRole;

public record UserSearchCriteria(String search, UserRole role, String faculty) {}
