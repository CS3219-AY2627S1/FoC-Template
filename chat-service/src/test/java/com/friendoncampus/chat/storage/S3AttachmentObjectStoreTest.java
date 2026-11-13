package com.friendoncampus.chat.storage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.DeleteObjectResponse;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectResponse;
import software.amazon.awssdk.services.s3.model.ServerSideEncryption;

class S3AttachmentObjectStoreTest {
    private final S3Client s3 = mock(S3Client.class);

    @Test
    void storesPrivateEncryptedObjectUnderConversationScopedKey() {
        when(s3.putObject(any(PutObjectRequest.class), any(RequestBody.class)))
                .thenReturn(PutObjectResponse.builder().build());
        var store = new S3AttachmentObjectStore(s3, "chat-bucket", "/attachments/");
        UUID conversationId = UUID.randomUUID();
        UUID attachmentId = UUID.randomUUID();
        byte[] content = {1, 2, 3};

        var result = store.put(conversationId, attachmentId, "image/png", content);

        var request = ArgumentCaptor.forClass(PutObjectRequest.class);
        verify(s3).putObject(request.capture(), any(RequestBody.class));
        assertThat(result.provider()).isEqualTo("S3");
        assertThat(result.inlineContent()).isNull();
        assertThat(result.objectKey()).isEqualTo("attachments/" + conversationId + "/" + attachmentId);
        assertThat(request.getValue().bucket()).isEqualTo("chat-bucket");
        assertThat(request.getValue().key()).isEqualTo(result.objectKey());
        assertThat(request.getValue().contentType()).isEqualTo("image/png");
        assertThat(request.getValue().serverSideEncryption()).isEqualTo(ServerSideEncryption.AES256);
        assertThat(request.getValue().metadata()).containsEntry("conversation-id", conversationId.toString())
                .containsEntry("attachment-id", attachmentId.toString());
    }

    @Test
    void readsAndDeletesTheExactStoredObject() {
        byte[] content = {9, 8, 7};
        when(s3.getObjectAsBytes(any(GetObjectRequest.class)))
                .thenReturn(ResponseBytes.fromByteArray(GetObjectResponse.builder().build(), content));
        when(s3.deleteObject(any(DeleteObjectRequest.class)))
                .thenReturn(DeleteObjectResponse.builder().build());
        var store = new S3AttachmentObjectStore(s3, "chat-bucket", "attachments");

        assertThat(store.get("attachments/c/a", null)).isEqualTo(content);
        store.delete("attachments/c/a");

        var get = ArgumentCaptor.forClass(GetObjectRequest.class);
        var delete = ArgumentCaptor.forClass(DeleteObjectRequest.class);
        verify(s3).getObjectAsBytes(get.capture());
        verify(s3).deleteObject(delete.capture());
        assertThat(get.getValue().bucket()).isEqualTo("chat-bucket");
        assertThat(get.getValue().key()).isEqualTo("attachments/c/a");
        assertThat(delete.getValue().bucket()).isEqualTo("chat-bucket");
        assertThat(delete.getValue().key()).isEqualTo("attachments/c/a");
    }

    @Test
    void rejectsMissingBucketAndUnsafePrefix() {
        assertThatThrownBy(() -> new S3AttachmentObjectStore(s3, "", "attachments"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new S3AttachmentObjectStore(s3, "chat-bucket", "../escape"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
