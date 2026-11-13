package com.friendoncampus.supplier.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.mock.web.MockMultipartFile;

import com.friendoncampus.supplier.domain.Supplier;
import com.friendoncampus.supplier.repository.SupplierRepository;
import com.friendoncampus.supplier.storage.SupplierImageObjectStore;

class SupplierImageServiceTest {

    private final UUID supplierId = UUID.randomUUID();
    private SupplierRepository repository;
    private SupplierImageObjectStore store;
    private SupplierImageCleanup cleanup;
    private SupplierImageService service;

    @BeforeEach
    void setUp() {
        repository = mock(SupplierRepository.class);
        store = mock(SupplierImageObjectStore.class);
        cleanup = mock(SupplierImageCleanup.class);
        service = new SupplierImageService(repository, store, cleanup);
    }

    @Test
    void loadsUploadedImageUsingDatabaseMetadata() {
        Supplier supplier = supplier(4L);
        when(supplier.hasUploadedImage()).thenReturn(true);
        when(supplier.getImageObjectKey()).thenReturn("images/supplier/object");
        when(supplier.getImageContentType()).thenReturn("image/png");
        byte[] content = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
        when(store.get("images/supplier/object")).thenReturn(
                new SupplierImageObjectStore.StoredImage(
                        "images/supplier/object", "image/png", content));

        SupplierImageService.SupplierImage result = service.load(supplierId);

        assertThat(result.contentType()).isEqualTo("image/png");
        assertThat(result.content()).isSameAs(content);
        assertThat(result.supplierVersion()).isEqualTo(4L);
    }

    @Test
    void uploadsImageAndSchedulesReplacementCleanup() {
        Supplier supplier = supplier(2L);
        byte[] content = bytes(0xff, 0xd8, 0xff);
        when(store.put(supplierId, "image/jpeg", content)).thenReturn(
                new SupplierImageObjectStore.StoredImage("images/new", "image/jpeg", null));
        when(supplier.useUploadedImage("images/new", "image/jpeg")).thenReturn("images/old");

        Supplier result = service.upload(
                supplierId,
                2L,
                new MockMultipartFile("file", "photo.jpg", "image/jpeg", content));

        assertThat(result).isSameAs(supplier);
        verify(repository).flush();
        verify(cleanup).replaceAfterCompletion("images/new", "images/old");
    }

    @Test
    void rejectsStaleUploadBeforeWritingToStorage() {
        Supplier supplier = supplier(3L);

        assertThatThrownBy(() -> service.upload(
                supplierId,
                2L,
                new MockMultipartFile(
                        "file", "photo.jpg", "image/jpeg", bytes(0xff, 0xd8, 0xff))))
                .isInstanceOf(SupplierUpdateConflictException.class);

        verify(store, never()).put(
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any());
    }

    @Test
    void removesNewObjectWhenOptimisticFlushFails() {
        Supplier supplier = supplier(2L);
        byte[] content = bytes(0xff, 0xd8, 0xff);
        when(store.put(supplierId, "image/jpeg", content)).thenReturn(
                new SupplierImageObjectStore.StoredImage("images/new", "image/jpeg", null));
        doThrow(new OptimisticLockingFailureException("stale")).when(repository).flush();

        assertThatThrownBy(() -> service.upload(
                supplierId,
                2L,
                new MockMultipartFile("file", "photo.jpg", "image/jpeg", content)))
                .isInstanceOf(SupplierUpdateConflictException.class);

        verify(cleanup).deleteFailedUpload("images/new");
    }

    @Test
    void removesEitherImageSourceAndSchedulesObjectCleanup() {
        Supplier supplier = supplier(2L);
        when(supplier.getImageUrl()).thenReturn(null);
        when(supplier.hasUploadedImage()).thenReturn(true);
        when(supplier.clearImage()).thenReturn("images/old");

        Supplier result = service.remove(supplierId, 2L);

        assertThat(result).isSameAs(supplier);
        verify(repository).flush();
        verify(cleanup).deleteAfterCommit("images/old");
    }

    private Supplier supplier(long version) {
        Supplier supplier = mock(Supplier.class);
        when(supplier.getId()).thenReturn(supplierId);
        when(supplier.getVersion()).thenReturn(version);
        when(repository.findById(supplierId)).thenReturn(Optional.of(supplier));
        return supplier;
    }

    private static byte[] bytes(int... values) {
        byte[] result = new byte[values.length];
        for (int index = 0; index < values.length; index++) {
            result[index] = (byte) values[index];
        }
        return result;
    }
}
