package com.friendoncampus.supplier.service;

import java.util.UUID;

public class SupplierNotFoundException extends RuntimeException {

    private final UUID supplierId;

    public SupplierNotFoundException(UUID supplierId) {
        super("Supplier with ID " + supplierId + " was not found");
        this.supplierId = supplierId;
    }

    public UUID getSupplierId() {
        return supplierId;
    }
}
