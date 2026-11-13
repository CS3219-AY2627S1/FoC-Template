package com.cs3219.foc.user.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.cs3219.foc.user.mapper.UserMapper;
import com.cs3219.foc.user.model.entity.User;
import com.cs3219.foc.user.repository.UserRepository;
import com.cs3219.foc.user.security.CurrentUserService;
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

class AvatarServiceTests {
    private final UserRepository repository = mock(UserRepository.class);
    private final TransactionTemplate transactionTemplate = mock(TransactionTemplate.class);
    private final AvatarStorageService storage = mock(AvatarStorageService.class);
    private final AvatarImageProcessor processor = mock(AvatarImageProcessor.class);
    private final CurrentUserService currentUserService = mock(CurrentUserService.class);
    private final AvatarService service = new AvatarService(
            repository,
            mock(UserMapper.class),
            storage,
            processor,
            transactionTemplate,
            mock(ApplicationEventPublisher.class),
            currentUserService);
    private final UUID ownerId = UUID.randomUUID();
    private final MockMultipartFile file = new MockMultipartFile("file", new byte[] {1});
    private final byte[] bytes = {1, 2};
    private final String key = "new-image";

    @BeforeEach
    void setup() {
        when(processor.processAvatar(file)).thenReturn(bytes);
        when(storage.createAvatarKey(ownerId)).thenReturn(key);
    }

    @Test
    void uploadAvatarUsesAuthenticatedId() {
        when(currentUserService.requireCurrentUserId()).thenReturn(ownerId);
        when(transactionTemplate.execute(any())).thenReturn(null);

        service.uploadAvatar(file);

        verify(storage).createAvatarKey(ownerId);
        verify(storage).storeAvatar(key, bytes);
    }

    @Test
    void removeAvatarUsesAuthenticatedId() {
        when(currentUserService.requireCurrentUserId()).thenReturn(ownerId);
        when(repository.findForUpdateById(ownerId)).thenReturn(Optional.of(mock(User.class)));

        service.removeAvatar();

        verify(repository).findForUpdateById(ownerId);
    }

    @Test
    void putFailureAttemptsCleanupAndPreservesOriginalFailure() {
        var failure = new IllegalStateException("PUT response lost");
        var cleanupFailure = new IllegalStateException("DELETE unavailable");
        doThrow(failure).when(storage).storeAvatar(key, bytes);
        doThrow(cleanupFailure).when(storage).deleteAvatar(key);
        assertThatThrownBy(() -> service.uploadAvatar(ownerId, file))
                .isSameAs(failure)
                .hasSuppressedException(cleanupFailure);
        verify(storage).deleteAvatar(key);
        verifyNoInteractions(transactionTemplate);
    }

    @Test
    void databaseUnavailableBeforeTransactionStartsStillDeletesUpload() {
        var failure = new CannotCreateTransactionException("PostgreSQL unavailable");
        when(transactionTemplate.execute(any())).thenThrow(failure);
        assertThatThrownBy(() -> service.uploadAvatar(ownerId, file)).isSameAs(failure);
        var order = inOrder(storage, transactionTemplate);
        order.verify(storage).createAvatarKey(ownerId);
        order.verify(storage).storeAvatar(key, bytes);
        order.verify(transactionTemplate).execute(any());
        order.verify(storage).deleteAvatar(key);
    }

    @Test
    void databaseOutageCleanupFailureDoesNotMaskOriginalException() {
        var failure = new CannotCreateTransactionException("PostgreSQL unavailable");
        var cleanupFailure = new IllegalStateException("S3 unavailable");
        when(transactionTemplate.execute(any())).thenThrow(failure);
        doThrow(cleanupFailure).when(storage).deleteAvatar(key);
        assertThatThrownBy(() -> service.uploadAvatar(ownerId, file))
                .isSameAs(failure)
                .hasSuppressedException(cleanupFailure);
    }

    @Test
    void unknownTransactionCompletionRetainsNewUpload() {
        completeTransaction(TransactionSynchronization.STATUS_UNKNOWN);
        verify(storage, never()).deleteAvatar(anyString());
    }

    @Test
    void rollbackCleanupFailureDoesNotEscapeCompletionCallback() {
        doThrow(new IllegalStateException("S3 unavailable")).when(storage).deleteAvatar(key);
        assertThatCode(() -> completeTransaction(TransactionSynchronization.STATUS_ROLLED_BACK))
                .doesNotThrowAnyException();
        verify(storage).deleteAvatar(key);
    }

    private void completeTransaction(int completionStatus) {
        when(repository.findForUpdateById(ownerId)).thenReturn(Optional.of(mock(User.class)));
        when(transactionTemplate.execute(any())).thenAnswer(invocation -> {
            TransactionCallback<?> callback = invocation.getArgument(0);
            return callback.doInTransaction(mock(TransactionStatus.class));
        });
        TransactionSynchronizationManager.initSynchronization();
        try {
            service.uploadAvatar(ownerId, file);
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
        assertThatThrownBy(() -> service.uploadAvatar(ownerId, file)).isSameAs(failure);
        verify(storage, never()).deleteAvatar(anyString());
    }
}
