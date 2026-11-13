package com.cs3219.foc.user.model.dto;

import java.util.List;

public record PageDto<T>(List<T> items, long total, int page, int size) {}
