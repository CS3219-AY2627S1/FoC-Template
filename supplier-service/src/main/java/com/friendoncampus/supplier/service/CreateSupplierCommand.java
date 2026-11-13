package com.friendoncampus.supplier.service;

import java.time.LocalTime;

import com.friendoncampus.supplier.domain.SupplierStatus;

public record CreateSupplierCommand(
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
        SupplierStatus status) {
}
