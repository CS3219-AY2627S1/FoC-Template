package com.cs3219.foc.user.service;

import static com.cs3219.foc.user.support.AvatarTestImages.image;
import static org.assertj.core.api.Assertions.*;

import com.cs3219.foc.user.exception.AvatarException;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;

class AvatarImageProcessorTests {
    private final AvatarImageProcessor processor = new AvatarImageProcessor();

    @ParameterizedTest
    @ValueSource(strings = {"png", "jpeg"})
    void decodesContentsAndResizesToPng(String format) throws Exception {
        var original = image(format, 1024, 256);
        var misleadingName = new MockMultipartFile("file", "../../not-an-image.txt", "text/plain", original.getBytes());
        var bytes = processor.processAvatar(misleadingName);
        assertThat(Arrays.copyOf(bytes, 8))
                .containsExactly(
                        (byte) 137, (byte) 80, (byte) 78, (byte) 71, (byte) 13, (byte) 10, (byte) 26, (byte) 10);
        var result = ImageIO.read(new ByteArrayInputStream(bytes));
        assertThat(result.getWidth()).isEqualTo(512);
        assertThat(result.getHeight()).isEqualTo(128);
    }

    @Test
    void doesNotUpscaleSmallImagesAndDiscardsAppendedContent() throws Exception {
        var original = image("png", 20, 10).getBytes();
        var output = new ByteArrayOutputStream();
        output.write(original);
        output.write("PRIVATE_SOURCE_CONTENT".getBytes(StandardCharsets.UTF_8));
        var bytes = processor.processAvatar(new MockMultipartFile("file", output.toByteArray()));
        var decoded = ImageIO.read(new ByteArrayInputStream(bytes));
        assertThat(decoded.getWidth()).isEqualTo(20);
        assertThat(decoded.getHeight()).isEqualTo(10);
        assertThat(new String(bytes, StandardCharsets.ISO_8859_1)).doesNotContain("PRIVATE_SOURCE_CONTENT");
    }

    @Test
    void rejectsEmptyFile() {
        assertThatThrownBy(() -> processor.processAvatar(new MockMultipartFile("file", new byte[0])))
                .isInstanceOfSatisfying(
                        AvatarException.class, ex -> assertThat(ex.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    void rejectsOversizedFile() {
        assertThatThrownBy(() -> processor.processAvatar(new MockMultipartFile("file", new byte[2 * 1024 * 1024 + 1])))
                .isInstanceOfSatisfying(AvatarException.class, ex -> assertThat(ex.getStatus())
                        .isEqualTo(HttpStatus.CONTENT_TOO_LARGE));
    }

    @Test
    void rejectsSvgRegardlessOfFilename() {
        var file = new MockMultipartFile("file", "image.png", "image/png", "<svg/>".getBytes(StandardCharsets.UTF_8));
        assertThatThrownBy(() -> processor.processAvatar(file))
                .isInstanceOfSatisfying(AvatarException.class, ex -> assertThat(ex.getStatus())
                        .isEqualTo(HttpStatus.UNSUPPORTED_MEDIA_TYPE));
    }

    @Test
    void rejectsGif() throws Exception {
        var file = image("gif", 20, 20);
        assertThatThrownBy(() -> processor.processAvatar(file))
                .isInstanceOfSatisfying(AvatarException.class, ex -> assertThat(ex.getStatus())
                        .isEqualTo(HttpStatus.UNSUPPORTED_MEDIA_TYPE));
    }

    @Test
    void rejectsTruncatedPng() throws Exception {
        var file =
                new MockMultipartFile("file", Arrays.copyOf(image("png", 20, 20).getBytes(), 24));
        assertThatThrownBy(() -> processor.processAvatar(file))
                .isInstanceOfSatisfying(
                        AvatarException.class, ex -> assertThat(ex.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    void rejectsDimensionsBeforeDecoding() throws Exception {
        var file = image("png", 4097, 1);
        assertThatThrownBy(() -> processor.processAvatar(file))
                .isInstanceOfSatisfying(
                        AvatarException.class, ex -> assertThat(ex.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST));
    }
}
