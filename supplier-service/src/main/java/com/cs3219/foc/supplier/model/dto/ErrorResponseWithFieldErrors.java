package com.cs3219.foc.supplier.model.dto;

import java.util.Map;

public record ErrorResponseWithFieldErrors(String code, String message, Map<String, String> fieldErrors) {}
