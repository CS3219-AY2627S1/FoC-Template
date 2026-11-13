package com.friendoncampus.supplier.storage;

import java.util.UUID;

public class UnavailableSupplierImageObjectStore implements SupplierImageObjectStore {

    @Override
    public StoredImage put(UUID supplierId, String contentType, byte[] content) {
        throw unavailable();
    }

    @Override
    public StoredImage get(String objectKey) {
        throw unavailable();
    }

    @Override
    public void delete(String objectKey) {
        throw unavailable();
    }

    private static SupplierImageStorageException unavailable() {
        return new SupplierImageStorageException(
                "Supplier image uploads are not configured in this environment");
    }
}
