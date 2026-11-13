package com.cs3219.foc.user.infrastructure.storage;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

import com.cs3219.foc.user.config.S3Properties;
import com.cs3219.foc.user.exception.StorageException;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

class S3ObjectStorageTests {
    @Test
    void preservesProviderFailureDetails() {
        var s3Client = mock(S3Client.class);
        var providerFailure = S3Exception.builder()
                .message("Access denied")
                .statusCode(403)
                .requestId("request-123")
                .build();
        when(s3Client.putObject(any(PutObjectRequest.class), any(RequestBody.class)))
                .thenThrow(providerFailure);
        var storage = new S3ObjectStorage(s3Client, mock(S3Presigner.class), new S3Properties("images"));

        assertThatThrownBy(() -> storage.putObject("image.png", new byte[] {1}, "image/png"))
                .isInstanceOf(StorageException.class)
                .hasCause(providerFailure)
                .hasMessageContaining("Access denied");
    }
}
