package com.cs3219.foc.order.model.dto;

import java.util.UUID;

public record SupplierPickupDto(
        UUID id, String name, String building, String floor, String locationDescription, boolean active) {}
