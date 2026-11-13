package com.cs3219.foc.user.infrastructure.storage;

import com.cs3219.foc.user.config.S3Properties;
import com.cs3219.foc.user.exception.StorageException;
import java.time.Duration;
import lombok.RequiredArgsConstructor;
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
public class S3ObjectStorage implements ObjectStorage {
    private final S3Client s3Client;
    private final S3Presigner s3Presigner;
    private final S3Properties s3Properties;

    @Override
    public void putObject(String key, byte[] bytes, String contentType) {
        try {
            s3Client.putObject(
                    PutObjectRequest.builder()
                            .bucket(s3Properties.bucket())
                            .key(key)
                            .contentType(contentType)
                            .build(),
                    RequestBody.fromBytes(bytes));
        } catch (SdkException exception) {
            throw new StorageException(exception);
        }
    }

    @Override
    public String createPresignedUrl(String key, Duration lifetime) {
        try {
            return s3Presigner
                    .presignGetObject(GetObjectPresignRequest.builder()
                            .signatureDuration(lifetime)
                            .getObjectRequest(GetObjectRequest.builder()
                                    .bucket(s3Properties.bucket())
                                    .key(key)
                                    .build())
                            .build())
                    .url()
                    .toString();
        } catch (SdkException exception) {
            throw new StorageException(exception);
        }
    }

    @Override
    public void deleteObject(String key) {
        try {
            s3Client.deleteObject(DeleteObjectRequest.builder()
                    .bucket(s3Properties.bucket())
                    .key(key)
                    .build());
        } catch (SdkException exception) {
            throw new StorageException(exception);
        }
    }
}
