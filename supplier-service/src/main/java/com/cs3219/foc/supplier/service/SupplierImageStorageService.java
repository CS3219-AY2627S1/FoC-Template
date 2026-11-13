package com.cs3219.foc.supplier.service;

import com.cs3219.foc.supplier.config.SupplierImageStorageProperties;
import com.cs3219.foc.supplier.infrastructure.storage.ObjectStorage;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class SupplierImageStorageService {
    private static final String PREFIX = "supplier-images/";

    private final ObjectStorage objectStorage;
    private final SupplierImageStorageProperties supplierImageStorageProperties;

    public void deleteSupplierImage(String key) {
        objectStorage.deleteObject(key);
    }

    public void storeSupplierImage(String key, byte[] bytes) {
        objectStorage.putObject(key, bytes, "image/jpeg");
    }

    public String createPresignedUrl(String key) {
        if (key == null) return null;

        return objectStorage.createPresignedUrl(key, supplierImageStorageProperties.readUrlTtl());
    }

    public String createSupplierImageKey(UUID supplierId) {
        return PREFIX + supplierId + "/" + UUID.randomUUID() + ".jpg";
    }
}
