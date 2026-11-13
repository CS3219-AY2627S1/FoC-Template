package com.friendoncampus.supplier.service;

import com.friendoncampus.supplier.domain.SupplierStatus;

public record ChangeSupplierStatusCommand(
        SupplierStatus status,
        long version) {
}
