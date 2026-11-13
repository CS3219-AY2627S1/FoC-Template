package com.friendoncampus.supplier.service;

import java.util.UUID;

import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.friendoncampus.supplier.domain.Supplier;
import com.friendoncampus.supplier.repository.SupplierRepository;
import com.friendoncampus.supplier.storage.SupplierImageObjectStore;

@Service
@Transactional(readOnly = true)
public class SupplierImageService {

    private final SupplierRepository supplierRepository;
    private final SupplierImageObjectStore imageStore;
    private final SupplierImageCleanup imageCleanup;

    public SupplierImageService(
            SupplierRepository supplierRepository,
            SupplierImageObjectStore imageStore,
            SupplierImageCleanup imageCleanup) {
        this.supplierRepository = supplierRepository;
        this.imageStore = imageStore;
        this.imageCleanup = imageCleanup;
    }

    public SupplierImage load(UUID supplierId) {
        Supplier supplier = findSupplier(supplierId);
        if (!supplier.hasUploadedImage()) {
            throw new SupplierImageNotFoundException(supplierId);
        }
        SupplierImageObjectStore.StoredImage stored = imageStore.get(supplier.getImageObjectKey());
        return new SupplierImage(
                supplier.getImageContentType(),
                stored.content(),
                supplier.getVersion());
    }

    @Transactional
    public Supplier upload(UUID supplierId, long requestedVersion, MultipartFile file) {
        SupplierImageUpload upload = SupplierImageUpload.from(file);
        Supplier supplier = findSupplier(supplierId);
        requireVersion(supplier, requestedVersion);

        SupplierImageObjectStore.StoredImage stored = imageStore.put(
                supplierId,
                upload.contentType(),
                upload.content());
        String previousObjectKey = supplier.useUploadedImage(
                stored.objectKey(),
                upload.contentType());

        try {
            supplierRepository.flush();
        } catch (OptimisticLockingFailureException exception) {
            imageCleanup.deleteFailedUpload(stored.objectKey());
            throw new SupplierUpdateConflictException(
                    supplierId,
                    requestedVersion,
                    null,
                    exception);
        }
        imageCleanup.replaceAfterCompletion(stored.objectKey(), previousObjectKey);
        return supplier;
    }

    @Transactional
    public Supplier remove(UUID supplierId, long requestedVersion) {
        Supplier supplier = findSupplier(supplierId);
        requireVersion(supplier, requestedVersion);

        boolean hadImage = supplier.getImageUrl() != null || supplier.hasUploadedImage();
        String previousObjectKey = supplier.clearImage();
        if (!hadImage) {
            return supplier;
        }

        try {
            supplierRepository.flush();
        } catch (OptimisticLockingFailureException exception) {
            throw new SupplierUpdateConflictException(
                    supplierId,
                    requestedVersion,
                    null,
                    exception);
        }
        imageCleanup.deleteAfterCommit(previousObjectKey);
        return supplier;
    }

    private Supplier findSupplier(UUID supplierId) {
        return supplierRepository.findById(supplierId)
                .orElseThrow(() -> new SupplierNotFoundException(supplierId));
    }

    private static void requireVersion(Supplier supplier, long requestedVersion) {
        if (supplier.getVersion() != requestedVersion) {
            throw new SupplierUpdateConflictException(
                    supplier.getId(),
                    requestedVersion,
                    supplier.getVersion());
        }
    }

    public record SupplierImage(String contentType, byte[] content, long supplierVersion) {
    }
}
