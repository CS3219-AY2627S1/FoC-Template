package com.friendoncampus.supplier.storage;

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

public class S3SupplierImageObjectStore implements SupplierImageObjectStore {

    private final S3Client s3;
    private final String bucket;
    private final String keyPrefix;

    public S3SupplierImageObjectStore(S3Client s3, String bucket, String keyPrefix) {
        if (bucket == null || bucket.isBlank()) {
            throw new IllegalArgumentException(
                    "SUPPLIER_S3_BUCKET is required when S3 image storage is enabled");
        }
        this.s3 = s3;
        this.bucket = bucket;
        this.keyPrefix = normalizePrefix(keyPrefix);
    }

    @Override
    public StoredImage put(UUID supplierId, String contentType, byte[] content) {
        String objectId = UUID.randomUUID().toString();
        String key = keyPrefix + "/" + supplierId + "/" + objectId;
        try {
            s3.putObject(PutObjectRequest.builder()
                            .bucket(bucket)
                            .key(key)
                            .contentType(contentType)
                            .serverSideEncryption(ServerSideEncryption.AES256)
                            .metadata(Map.of("supplier-id", supplierId.toString()))
                            .build(),
                    RequestBody.fromBytes(content));
            return new StoredImage(key, contentType, null);
        } catch (RuntimeException exception) {
            throw new SupplierImageStorageException("Supplier image could not be stored", exception);
        }
    }

    @Override
    public StoredImage get(String objectKey) {
        try {
            ResponseBytes<GetObjectResponse> response = s3.getObjectAsBytes(
                    GetObjectRequest.builder().bucket(bucket).key(objectKey).build());
            return new StoredImage(
                    objectKey,
                    response.response().contentType(),
                    response.asByteArray());
        } catch (RuntimeException exception) {
            throw new SupplierImageStorageException("Supplier image could not be loaded", exception);
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
            throw new SupplierImageStorageException("Supplier image could not be removed", exception);
        }
    }

    private static String normalizePrefix(String prefix) {
        String normalized = prefix == null ? "images" : prefix.trim();
        normalized = normalized.replaceAll("^/+|/+$", "");
        if (normalized.isBlank() || normalized.contains("..")) {
            throw new IllegalArgumentException(
                    "SUPPLIER_S3_KEY_PREFIX must be a safe non-empty prefix");
        }
        return normalized;
    }
}
