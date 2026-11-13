package com.friendoncampus.chat.storage;

import java.util.UUID;

public interface AttachmentObjectStore {
    String provider();

    StoredObject put(UUID conversationId, UUID attachmentId, String contentType, byte[] content);

    byte[] get(String objectKey, byte[] inlineContent);

    void delete(String objectKey);

    record StoredObject(String provider, String objectKey, byte[] inlineContent) {
    }
}
