package com.cs3219.foc.supplier.exception;

import java.util.UUID;

public class SupplierNotFoundException extends RuntimeException {
    public SupplierNotFoundException(UUID id) {
        super("Supplier not found: " + id);
    }
}
