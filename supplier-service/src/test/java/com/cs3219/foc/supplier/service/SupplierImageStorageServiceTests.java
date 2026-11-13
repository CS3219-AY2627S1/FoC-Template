package com.cs3219.foc.supplier.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import com.cs3219.foc.supplier.config.SupplierImageStorageProperties;
import com.cs3219.foc.supplier.infrastructure.storage.ObjectStorage;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SupplierImageStorageServiceTests {
    private final ObjectStorage objectStorage = mock(ObjectStorage.class);
    private final SupplierImageStorageProperties properties =
            new SupplierImageStorageProperties(Duration.ofMinutes(10));
    private final SupplierImageStorageService supplierImageStorageService =
            new SupplierImageStorageService(objectStorage, properties);

    @Test
    void choosesImageKeyAndContentType() {
        var ownerId = UUID.randomUUID();
        var bytes = new byte[] {1, 2};
        var key = supplierImageStorageService.createSupplierImageKey(ownerId);
        supplierImageStorageService.storeSupplierImage(key, bytes);
        assertThat(key).startsWith("supplier-images/" + ownerId + "/").endsWith(".jpg");
        verify(objectStorage).putObject(key, bytes, "image/jpeg");
    }

    @Test
    void appliesUrlPolicyAndDoesNotSignMissingImages() {
        when(objectStorage.createPresignedUrl("image", Duration.ofMinutes(10))).thenReturn("signed-url");
        assertThat(supplierImageStorageService.createPresignedUrl("image")).isEqualTo("signed-url");
        assertThat(supplierImageStorageService.createPresignedUrl(null)).isNull();
        verify(objectStorage).createPresignedUrl("image", Duration.ofMinutes(10));
        verifyNoMoreInteractions(objectStorage);
    }
}
