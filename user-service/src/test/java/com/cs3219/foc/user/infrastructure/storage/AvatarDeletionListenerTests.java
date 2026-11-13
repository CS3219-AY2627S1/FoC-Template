package com.cs3219.foc.user.infrastructure.storage;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

import com.cs3219.foc.user.exception.StorageException;
import com.cs3219.foc.user.model.dto.event.AvatarDeletionRequestedEvent;
import org.junit.jupiter.api.Test;

class AvatarDeletionListenerTests {
    @Test
    void deletionFailurePropagatesForRetry() {
        var objectStorage = mock(ObjectStorage.class);
        doThrow(new StorageException(new RuntimeException("S3 unavailable")))
                .when(objectStorage)
                .deleteObject("old-image");
        var listener = new AvatarDeletionListener(objectStorage);
        assertThatThrownBy(() -> listener.deleteAvatar(new AvatarDeletionRequestedEvent("old-image")))
                .isInstanceOf(StorageException.class);
        verify(objectStorage).deleteObject("old-image");
    }
}
