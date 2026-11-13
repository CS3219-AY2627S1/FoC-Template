package com.friendoncampus.chat.storage;

import java.util.Map;
import java.util.UUID;

import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.ServerSideEncryption;

public class S3AttachmentObjectStore implements AttachmentObjectStore {
    private final S3Client s3;
    private final String bucket;
    private final String keyPrefix;

    public S3AttachmentObjectStore(S3Client s3, String bucket, String keyPrefix) {
        if (bucket == null || bucket.isBlank()) {
            throw new IllegalArgumentException("CHAT_S3_BUCKET is required when S3 attachment storage is enabled");
        }
        this.s3 = s3;
        this.bucket = bucket;
        this.keyPrefix = normalizePrefix(keyPrefix);
    }

    @Override
    public String provider() {
        return "S3";
    }

    @Override
    public StoredObject put(UUID conversationId, UUID attachmentId, String contentType, byte[] content) {
        String key = keyPrefix + "/" + conversationId + "/" + attachmentId;
        try {
            s3.putObject(PutObjectRequest.builder()
                            .bucket(bucket)
                            .key(key)
                            .contentType(contentType)
                            .serverSideEncryption(ServerSideEncryption.AES256)
                            .metadata(Map.of(
                                    "conversation-id", conversationId.toString(),
                                    "attachment-id", attachmentId.toString()))
                            .build(),
                    RequestBody.fromBytes(content));
            return new StoredObject(provider(), key, null);
        } catch (RuntimeException exception) {
            throw new AttachmentStorageException("Image could not be stored", exception);
        }
    }

    @Override
    public byte[] get(String objectKey, byte[] inlineContent) {
        try {
            ResponseBytes<GetObjectResponse> response = s3.getObjectAsBytes(GetObjectRequest.builder()
                    .bucket(bucket).key(objectKey).build());
            return response.asByteArray();
        } catch (RuntimeException exception) {
            throw new AttachmentStorageException("Image could not be loaded", exception);
        }
    }

    @Override
    public void delete(String objectKey) {
        if (objectKey == null) {
            return;
        }
        try {
            s3.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(objectKey).build());
        } catch (RuntimeException exception) {
            throw new AttachmentStorageException("Abandoned image could not be removed", exception);
        }
    }

    private static String normalizePrefix(String prefix) {
        String normalized = prefix == null ? "attachments" : prefix.trim();
        normalized = normalized.replaceAll("^/+|/+$", "");
        if (normalized.isBlank() || normalized.contains("..")) {
            throw new IllegalArgumentException("CHAT_S3_KEY_PREFIX must be a safe non-empty prefix");
        }
        return normalized;
    }
}
