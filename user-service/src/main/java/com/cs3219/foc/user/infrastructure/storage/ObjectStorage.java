package com.cs3219.foc.user.infrastructure.storage;

import java.time.Duration;

public interface ObjectStorage {
    void putObject(String key, byte[] bytes, String contentType);

    String createPresignedUrl(String key, Duration lifetime);

    void deleteObject(String key);
}
