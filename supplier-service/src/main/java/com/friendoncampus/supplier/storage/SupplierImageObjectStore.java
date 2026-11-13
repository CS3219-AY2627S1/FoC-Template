package com.friendoncampus.supplier.storage;

import java.util.UUID;

public interface SupplierImageObjectStore {

    StoredImage put(UUID supplierId, String contentType, byte[] content);

    StoredImage get(String objectKey);

    void delete(String objectKey);

    record StoredImage(String objectKey, String contentType, byte[] content) {
    }
}
