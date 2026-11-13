package com.cs3219.foc.order.infrastructure.storage;

import java.time.Duration;

// private file storage: delivery photos and chat photos and videos
public interface DeliveryPhotoStorage {
    void put(String key, byte[] content, String contentType);

    default void putJpeg(String key, byte[] jpeg) {
        put(key, jpeg, "image/jpeg");
    }

    // to view photo in a link (with expiry time)
    String readUrl(String key, Duration lifetime);

    void delete(String key);
}
