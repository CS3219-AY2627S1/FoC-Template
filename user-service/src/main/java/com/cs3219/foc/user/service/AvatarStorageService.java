package com.cs3219.foc.user.service;

import com.cs3219.foc.user.config.AvatarStorageProperties;
import com.cs3219.foc.user.infrastructure.storage.ObjectStorage;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AvatarStorageService {
    private static final String PREFIX = "avatars/";

    private final ObjectStorage objectStorage;
    private final AvatarStorageProperties avatarStorageProperties;

    public void deleteAvatar(String key) {
        objectStorage.deleteObject(key);
    }

    public void storeAvatar(String key, byte[] bytes) {
        objectStorage.putObject(key, bytes, "image/png");
    }

    public String createPresignedUrl(String key) {
        if (key == null) return null;
        return objectStorage.createPresignedUrl(key, avatarStorageProperties.readUrlTtl());
    }

    public String createAvatarKey(UUID userId) {
        return PREFIX + userId + "/" + UUID.randomUUID() + ".png";
    }
}
