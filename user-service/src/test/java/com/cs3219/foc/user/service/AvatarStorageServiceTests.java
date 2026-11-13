package com.cs3219.foc.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import com.cs3219.foc.user.config.AvatarStorageProperties;
import com.cs3219.foc.user.infrastructure.storage.ObjectStorage;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AvatarStorageServiceTests {
    private final ObjectStorage objectStorage = mock(ObjectStorage.class);
    private final AvatarStorageProperties properties = new AvatarStorageProperties(Duration.ofMinutes(10));
    private final AvatarStorageService avatarStorageService = new AvatarStorageService(objectStorage, properties);

    @Test
    void choosesImageKeyAndContentType() {
        var ownerId = UUID.randomUUID();
        var bytes = new byte[] {1, 2};
        var key = avatarStorageService.createAvatarKey(ownerId);
        avatarStorageService.storeAvatar(key, bytes);
        assertThat(key).startsWith("avatars/" + ownerId + "/").endsWith(".png");
        verify(objectStorage).putObject(key, bytes, "image/png");
    }

    @Test
    void appliesUrlPolicyAndDoesNotSignMissingImages() {
        when(objectStorage.createPresignedUrl("image", Duration.ofMinutes(10))).thenReturn("signed-url");
        assertThat(avatarStorageService.createPresignedUrl("image")).isEqualTo("signed-url");
        assertThat(avatarStorageService.createPresignedUrl(null)).isNull();
        verify(objectStorage).createPresignedUrl("image", Duration.ofMinutes(10));
        verifyNoMoreInteractions(objectStorage);
    }
}
