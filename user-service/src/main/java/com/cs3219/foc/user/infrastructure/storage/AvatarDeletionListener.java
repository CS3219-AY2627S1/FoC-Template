package com.cs3219.foc.user.infrastructure.storage;

import com.cs3219.foc.user.model.dto.event.AvatarDeletionRequestedEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;

@Component
@RequiredArgsConstructor
public class AvatarDeletionListener {
    private final ObjectStorage objectStorage;

    @ApplicationModuleListener(id = "user-image-deletion", propagation = Propagation.NOT_SUPPORTED)
    public void deleteAvatar(AvatarDeletionRequestedEvent event) {
        objectStorage.deleteObject(event.key());
    }
}
