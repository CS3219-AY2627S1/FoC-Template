package com.cs3219.foc.order.infrastructure.storage;

import com.cs3219.foc.order.config.DeliveryPhotoStorageProperties;
import com.cs3219.foc.order.exception.DeliveryPhotoException;
import java.time.Duration;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

@Component
@RequiredArgsConstructor
public class S3DeliveryPhotoStorage implements DeliveryPhotoStorage {
    private final S3Client s3Client;
    private final S3Presigner s3Presigner;
    private final DeliveryPhotoStorageProperties properties;

    @Override
    public void put(String key, byte[] content, String contentType) {
        try {
            s3Client.putObject(
                    PutObjectRequest.builder()
                            .bucket(properties.bucket())
                            .key(key)
                            .contentType(contentType)
                            .build(),
                    RequestBody.fromBytes(content));
        } catch (SdkException exception) {
            throw new DeliveryPhotoException(HttpStatus.SERVICE_UNAVAILABLE, "The file could not be saved", exception);
        }
    }

    @Override
    public String readUrl(String key, Duration lifetime) {
        try {
            return s3Presigner
                    .presignGetObject(GetObjectPresignRequest.builder()
                            .signatureDuration(lifetime)
                            .getObjectRequest(GetObjectRequest.builder()
                                    .bucket(properties.bucket())
                                    .key(key)
                                    .build())
                            .build())
                    .url()
                    .toString();
        } catch (SdkException exception) {
            throw new DeliveryPhotoException(HttpStatus.SERVICE_UNAVAILABLE, "The file is unavailable", exception);
        }
    }

    @Override
    public void delete(String key) {
        try {
            s3Client.deleteObject(DeleteObjectRequest.builder()
                    .bucket(properties.bucket())
                    .key(key)
                    .build());
        } catch (SdkException exception) {
            throw new DeliveryPhotoException(
                    HttpStatus.SERVICE_UNAVAILABLE, "The file could not be removed", exception);
        }
    }
}
