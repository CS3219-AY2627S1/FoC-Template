package com.cs3219.foc.supplier.infrastructure.storage;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

import com.cs3219.foc.supplier.exception.StorageException;
import com.cs3219.foc.supplier.model.dto.event.SupplierImageDeletionRequestedEvent;
import org.junit.jupiter.api.Test;

class SupplierImageDeletionListenerTests {
    @Test
    void deletionFailurePropagatesForRetry() {
        var objectStorage = mock(ObjectStorage.class);
        doThrow(new StorageException(new RuntimeException("S3 unavailable")))
                .when(objectStorage)
                .deleteObject("old-image");
        var listener = new SupplierImageDeletionListener(objectStorage);
        assertThatThrownBy(() -> listener.deleteSupplierImage(new SupplierImageDeletionRequestedEvent("old-image")))
                .isInstanceOf(StorageException.class);
        verify(objectStorage).deleteObject("old-image");
    }
}
