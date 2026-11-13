package com.cs3219.foc.supplier.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.cs3219.foc.supplier.exception.SupplierImageException;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;

class SupplierImageProcessorTests {
    private final SupplierImageProcessor processor = new SupplierImageProcessor();

    private static byte[] png(int width, int height) throws IOException {
        var image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        try (var output = new ByteArrayOutputStream()) {
            ImageIO.write(image, "png", output);
            return output.toByteArray();
        }
    }

    private static HttpStatus statusOf(MockMultipartFile file) {
        try {
            new SupplierImageProcessor().processSupplierImage(file);
            return HttpStatus.OK;
        } catch (SupplierImageException exception) {
            return exception.getStatus();
        }
    }

    @Test
    void reencodesPngAsJpegAndShrinksLargeImages() throws IOException {
        var result =
                processor.processSupplierImage(new MockMultipartFile("file", "big.png", "image/png", png(2400, 1200)));
        var decoded = ImageIO.read(new ByteArrayInputStream(result));
        assertThat(decoded.getWidth()).isEqualTo(1200);
        assertThat(decoded.getHeight()).isEqualTo(600);
        // JPEG files start with the bytes FF D8.
        assertThat(result[0]).isEqualTo((byte) 0xFF);
        assertThat(result[1]).isEqualTo((byte) 0xD8);
    }

    @Test
    void keepsSmallImagesAtTheirSize() throws IOException {
        var result =
                processor.processSupplierImage(new MockMultipartFile("file", "small.png", "image/png", png(300, 200)));
        assertThat(ImageIO.read(new ByteArrayInputStream(result)).getWidth()).isEqualTo(300);
    }

    @Test
    void rejectsEmptyOversizedAndNonImageFiles() {
        assertThat(statusOf(new MockMultipartFile("file", "empty.png", "image/png", new byte[0])))
                .isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(statusOf(new MockMultipartFile(
                        "file", "huge.png", "image/png", new byte[SupplierImageProcessor.MAX_BYTES + 1])))
                .isEqualTo(HttpStatus.CONTENT_TOO_LARGE);
        assertThat(statusOf(new MockMultipartFile("file", "notes.png", "image/png", "not an image".getBytes())))
                .isEqualTo(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    }
}
