package com.friendoncampus.supplier.service;

import java.util.UUID;

public class SupplierImageNotFoundException extends RuntimeException {

    private final UUID supplierId;

    public SupplierImageNotFoundException(UUID supplierId) {
        super("Supplier with ID " + supplierId + " does not have an uploaded image");
        this.supplierId = supplierId;
    }

    public UUID getSupplierId() {
        return supplierId;
    }
}
