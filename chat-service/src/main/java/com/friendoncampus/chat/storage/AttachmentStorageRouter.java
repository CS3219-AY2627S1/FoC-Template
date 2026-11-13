package com.friendoncampus.chat.storage;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class AttachmentStorageRouter {
    private final Map<String, AttachmentObjectStore> stores;
    private final String activeProvider;

    public AttachmentStorageRouter(List<AttachmentObjectStore> stores,
            @Value("${app.attachments.storage:database}") String activeProvider) {
        this.stores = stores.stream().collect(Collectors.toUnmodifiableMap(
                AttachmentObjectStore::provider, Function.identity()));
        this.activeProvider = activeProvider.toUpperCase(Locale.ROOT);
        store(this.activeProvider);
    }

    public AttachmentObjectStore.StoredObject put(UUID conversationId, UUID attachmentId,
            String contentType, byte[] content) {
        return store(activeProvider).put(conversationId, attachmentId, contentType, content);
    }

    public byte[] get(String provider, String objectKey, byte[] inlineContent) {
        return store(provider).get(objectKey, inlineContent);
    }

    public void delete(String provider, String objectKey) {
        store(provider).delete(objectKey);
    }

    private AttachmentObjectStore store(String provider) {
        AttachmentObjectStore store = stores.get(provider.toUpperCase(Locale.ROOT));
        if (store == null) {
            throw new AttachmentStorageException("Attachment storage provider is unavailable: " + provider);
        }
        return store;
    }
}
