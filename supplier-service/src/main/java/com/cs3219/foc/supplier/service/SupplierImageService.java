package com.cs3219.foc.supplier.service;

import com.cs3219.foc.supplier.exception.SupplierNotFoundException;
import com.cs3219.foc.supplier.mapper.SupplierMapper;
import com.cs3219.foc.supplier.model.dto.SupplierDto;
import com.cs3219.foc.supplier.model.dto.event.SupplierChange;
import com.cs3219.foc.supplier.model.dto.event.SupplierChangedEvent;
import com.cs3219.foc.supplier.model.dto.event.SupplierImageDeletionRequestedEvent;
import com.cs3219.foc.supplier.model.entity.Supplier;
import com.cs3219.foc.supplier.repository.SupplierRepository;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

@Service
@Slf4j
@RequiredArgsConstructor
public class SupplierImageService {
    private final SupplierRepository supplierRepository;
    private final SupplierMapper supplierMapper;
    private final SupplierImageStorageService supplierImageStorageService;
    private final SupplierImageProcessor supplierImageProcessor;
    private final TransactionTemplate transactionTemplate;
    private final ApplicationEventPublisher eventPublisher;

    public SupplierDto uploadSupplierImage(UUID supplierId, MultipartFile file) {
        var bytes = supplierImageProcessor.processSupplierImage(file);
        var key = storeSupplierImage(supplierId, bytes);

        try {
            return transactionTemplate.execute(status -> {
                var supplier = changeImage(supplierId, key);

                return buildSupplierDto(supplier);
            });
        } catch (CannotCreateTransactionException failure) {
            cleanupFailedUpload(key, failure);

            throw failure;
        }
    }

    @Transactional
    public SupplierDto removeSupplierImage(UUID supplierId) {
        var supplier = changeImage(supplierId, null);

        return buildSupplierDto(supplier);
    }

    private String storeSupplierImage(UUID supplierId, byte[] bytes) {
        var key = supplierImageStorageService.createSupplierImageKey(supplierId);

        try {
            supplierImageStorageService.storeSupplierImage(key, bytes);
            return key;
        } catch (RuntimeException failure) {
            cleanupFailedUpload(key, failure);

            throw failure;
        }
    }

    private Supplier changeImage(UUID supplierId, String newKey) {
        if (newKey != null) {
            deleteUploadOnRollback(newKey);
        }

        var supplier = supplierRepository
                .findForUpdateById(supplierId)
                .orElseThrow(() -> new SupplierNotFoundException(supplierId));
        var previousKey = supplier.getImageKey();

        supplier.setImageKey(newKey);
        supplierRepository.flush();
        eventPublisher.publishEvent(
                SupplierChangedEvent.of(supplier.getId(), SupplierChange.IMAGE_CHANGED, OffsetDateTime.now()));

        if (previousKey != null) {
            var deletion = new SupplierImageDeletionRequestedEvent(previousKey);
            eventPublisher.publishEvent(deletion);
        }

        return supplier;
    }

    private void deleteUploadOnRollback(String key) {
        var rollbackCleanup = new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                switch (status) {
                    case STATUS_ROLLED_BACK -> {
                        try {
                            supplierImageStorageService.deleteSupplierImage(key);
                        } catch (RuntimeException failure) {
                            log.warn("Could not delete unreferenced image: key={}", key, failure);
                        }
                    }
                    case STATUS_UNKNOWN ->
                        log.warn("Image transaction outcome unknown; verify reference for key={}", key);
                    default -> {}
                }
            }
        };

        TransactionSynchronizationManager.registerSynchronization(rollbackCleanup);
    }

    private void cleanupFailedUpload(String key, RuntimeException originalFailure) {
        try {
            supplierImageStorageService.deleteSupplierImage(key);
        } catch (RuntimeException cleanupFailure) {
            originalFailure.addSuppressed(cleanupFailure);
            log.warn("Could not delete unreferenced image: key={}", key, cleanupFailure);
        }
    }

    private SupplierDto buildSupplierDto(Supplier supplier) {
        var imageKey = supplier.getImageKey();
        var imageUrl = supplierImageStorageService.createPresignedUrl(imageKey);

        return supplierMapper.toSupplierDto(supplier, imageUrl);
    }
}
