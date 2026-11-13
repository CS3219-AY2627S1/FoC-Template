package com.cs3219.foc.supplier.infrastructure.storage;

import com.cs3219.foc.supplier.model.dto.event.SupplierImageDeletionRequestedEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;

@Component
@RequiredArgsConstructor
public class SupplierImageDeletionListener {
    private final ObjectStorage objectStorage;

    @ApplicationModuleListener(id = "supplier-image-deletion", propagation = Propagation.NOT_SUPPORTED)
    public void deleteSupplierImage(SupplierImageDeletionRequestedEvent event) {
        objectStorage.deleteObject(event.key());
    }
}
