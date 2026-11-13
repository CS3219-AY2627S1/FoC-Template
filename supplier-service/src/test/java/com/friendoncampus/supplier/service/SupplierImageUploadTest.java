package com.friendoncampus.supplier.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

class SupplierImageUploadTest {

    @Test
    void acceptsSupportedImageSignatures() {
        assertThat(upload("photo.jpg", "image/jpeg", bytes(0xff, 0xd8, 0xff)).contentType())
                .isEqualTo("image/jpeg");
        assertThat(upload("photo.png", "image/png",
                bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)).contentType())
                .isEqualTo("image/png");
        assertThat(upload("photo.webp", "image/webp",
                "RIFF0000WEBP".getBytes(java.nio.charset.StandardCharsets.US_ASCII)).contentType())
                .isEqualTo("image/webp");
    }

    @Test
    void rejectsEmptyUnsupportedAndMismatchedFiles() {
        assertThatThrownBy(() -> upload("empty.png", "image/png", new byte[0]))
                .isInstanceOf(InvalidSupplierImageException.class)
                .hasMessage("Choose a non-empty image file");
        assertThatThrownBy(() -> upload("fake.png", "image/png", "not-image".getBytes()))
                .isInstanceOf(InvalidSupplierImageException.class)
                .hasMessage("Image must be a JPEG, PNG, or WebP file");
        assertThatThrownBy(() -> upload("wrong.png", "image/png", bytes(0xff, 0xd8, 0xff)))
                .isInstanceOf(InvalidSupplierImageException.class)
                .hasMessage("Image contents do not match the declared file type");
    }

    @Test
    void rejectsFilesLargerThanFiveMegabytesBeforeReadingThem() {
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "large.jpg",
                "image/jpeg",
                new byte[(int) SupplierImageUpload.MAX_SIZE_BYTES + 1]);

        assertThatThrownBy(() -> SupplierImageUpload.from(file))
                .isInstanceOf(InvalidSupplierImageException.class)
                .hasMessage("Image must be 5 MB or smaller");
    }

    private static SupplierImageUpload upload(String name, String type, byte[] content) {
        return SupplierImageUpload.from(new MockMultipartFile("file", name, type, content));
    }

    private static byte[] bytes(int... values) {
        byte[] result = new byte[values.length];
        for (int index = 0; index < values.length; index++) {
            result[index] = (byte) values[index];
        }
        return result;
    }
}
