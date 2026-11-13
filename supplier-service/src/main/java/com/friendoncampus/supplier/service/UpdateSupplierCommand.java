package com.friendoncampus.supplier.service;

import java.time.LocalTime;

public record UpdateSupplierCommand(
        String name,
        String type,
        String building,
        String floor,
        String locationDescription,
        double latitude,
        double longitude,
        LocalTime openingTime,
        LocalTime closingTime,
        String imageUrl,
        long version) {
}
