package com.cs3219.foc.supplier.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.cs3219.foc.supplier.mapper.SupplierMapper;
import com.cs3219.foc.supplier.model.entity.Supplier;
import com.cs3219.foc.supplier.repository.SupplierRepository;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.TransactionSystemException;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

class SupplierImageServiceTests {
    private final SupplierRepository repository = mock(SupplierRepository.class);
    private final TransactionTemplate transactionTemplate = mock(TransactionTemplate.class);
    private final SupplierImageStorageService storage = mock(SupplierImageStorageService.class);
    private final SupplierImageProcessor processor = mock(SupplierImageProcessor.class);
    private final SupplierImageService service = new SupplierImageService(
            repository,
            mock(SupplierMapper.class),
            storage,
            processor,
            transactionTemplate,
            mock(ApplicationEventPublisher.class));
    private final UUID ownerId = UUID.randomUUID();
    private final MockMultipartFile file = new MockMultipartFile("file", new byte[] {1});
    private final byte[] bytes = {1, 2};
    private final String key = "new-image";

    @BeforeEach
    void setup() {
        when(processor.processSupplierImage(file)).thenReturn(bytes);
        when(storage.createSupplierImageKey(ownerId)).thenReturn(key);
    }

    @Test
    void putFailureAttemptsCleanupAndPreservesOriginalFailure() {
        var failure = new IllegalStateException("PUT response lost");
        var cleanupFailure = new IllegalStateException("DELETE unavailable");
        doThrow(failure).when(storage).storeSupplierImage(key, bytes);
        doThrow(cleanupFailure).when(storage).deleteSupplierImage(key);
        assertThatThrownBy(() -> service.uploadSupplierImage(ownerId, file))
                .isSameAs(failure)
                .hasSuppressedException(cleanupFailure);
        verify(storage).deleteSupplierImage(key);
        verifyNoInteractions(transactionTemplate);
    }

    @Test
    void databaseUnavailableBeforeTransactionStartsStillDeletesUpload() {
        var failure = new CannotCreateTransactionException("PostgreSQL unavailable");
        when(transactionTemplate.execute(any())).thenThrow(failure);
        assertThatThrownBy(() -> service.uploadSupplierImage(ownerId, file)).isSameAs(failure);
        var order = inOrder(storage, transactionTemplate);
        order.verify(storage).createSupplierImageKey(ownerId);
        order.verify(storage).storeSupplierImage(key, bytes);
        order.verify(transactionTemplate).execute(any());
        order.verify(storage).deleteSupplierImage(key);
    }

    @Test
    void databaseOutageCleanupFailureDoesNotMaskOriginalException() {
        var failure = new CannotCreateTransactionException("PostgreSQL unavailable");
        var cleanupFailure = new IllegalStateException("S3 unavailable");
        when(transactionTemplate.execute(any())).thenThrow(failure);
        doThrow(cleanupFailure).when(storage).deleteSupplierImage(key);
        assertThatThrownBy(() -> service.uploadSupplierImage(ownerId, file))
                .isSameAs(failure)
                .hasSuppressedException(cleanupFailure);
    }

    @Test
    void unknownTransactionCompletionRetainsNewUpload() {
        completeTransaction(TransactionSynchronization.STATUS_UNKNOWN);
        verify(storage, never()).deleteSupplierImage(anyString());
    }

    @Test
    void rollbackCleanupFailureDoesNotEscapeCompletionCallback() {
        doThrow(new IllegalStateException("S3 unavailable")).when(storage).deleteSupplierImage(key);
        assertThatCode(() -> completeTransaction(TransactionSynchronization.STATUS_ROLLED_BACK))
                .doesNotThrowAnyException();
        verify(storage).deleteSupplierImage(key);
    }

    private void completeTransaction(int completionStatus) {
        when(repository.findForUpdateById(ownerId)).thenReturn(Optional.of(mock(Supplier.class)));
        when(transactionTemplate.execute(any())).thenAnswer(invocation -> {
            TransactionCallback<?> callback = invocation.getArgument(0);
            return callback.doInTransaction(mock(TransactionStatus.class));
        });
        TransactionSynchronizationManager.initSynchronization();
        try {
            service.uploadSupplierImage(ownerId, file);
            TransactionSynchronizationManager.getSynchronizations()
                    .forEach(synchronization -> synchronization.afterCompletion(completionStatus));
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void uncertainCommitDoesNotDeletePossiblyReferencedImage() {
        var failure = new TransactionSystemException("Commit response lost");
        when(transactionTemplate.execute(any())).thenThrow(failure);
        assertThatThrownBy(() -> service.uploadSupplierImage(ownerId, file)).isSameAs(failure);
        verify(storage, never()).deleteSupplierImage(anyString());
    }
}
