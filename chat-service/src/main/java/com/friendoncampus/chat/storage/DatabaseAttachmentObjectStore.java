package com.friendoncampus.chat.storage;

import java.util.UUID;

import org.springframework.stereotype.Component;

@Component
public class DatabaseAttachmentObjectStore implements AttachmentObjectStore {
    @Override
    public String provider() {
        return "DATABASE";
    }

    @Override
    public StoredObject put(UUID conversationId, UUID attachmentId, String contentType, byte[] content) {
        return new StoredObject(provider(), null, content.clone());
    }

    @Override
    public byte[] get(String objectKey, byte[] inlineContent) {
        if (inlineContent == null) {
            throw new AttachmentStorageException("Database attachment content is missing");
        }
        return inlineContent;
    }

    @Override
    public void delete(String objectKey) {
        // The metadata transaction owns inline content cleanup.
    }
}
