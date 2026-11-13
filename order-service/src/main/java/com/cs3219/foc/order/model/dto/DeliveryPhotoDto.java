package com.cs3219.foc.order.model.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

// viewable through link
public record DeliveryPhotoDto(UUID id, String url, OffsetDateTime expiresAt) {}
