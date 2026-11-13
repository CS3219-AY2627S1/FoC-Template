package com.cs3219.foc.order.service;

import com.cs3219.foc.order.exception.DeliveryPhotoException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

/**
 * Checks a chat video by its content: if is MP4, QuickTime (MOV), WebM, up to 20 MB.
 * only play the videos at browser
 */
@Component
public class ChatVideoValidator {
    static final int MAX_BYTES = 20 * 1024 * 1024;
    private static final byte[] WEBM = {0x1A, 0x45, (byte) 0xDF, (byte) 0xA3};

    public record Video(byte[] bytes, String contentType, String extension) {}

    public Video read(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new DeliveryPhotoException(HttpStatus.BAD_REQUEST, "A file is required");
        }
        byte[] bytes;
        try (var stream = file.getInputStream()) {
            bytes = stream.readNBytes(MAX_BYTES + 1);
        } catch (IOException exception) {
            throw new DeliveryPhotoException(HttpStatus.BAD_REQUEST, "The video could not be read", exception);
        }
        if (bytes.length > MAX_BYTES) {
            throw new DeliveryPhotoException(HttpStatus.CONTENT_TOO_LARGE, "The video must not exceed 20 MB");
        }
        // MP4 and MOV start with a size, then "ftyp" and a brand. QuickTime's brand is "qt  "
        if (bytes.length >= 12 && new String(bytes, 4, 4, StandardCharsets.ISO_8859_1).equals("ftyp")) {
            boolean quickTime = new String(bytes, 8, 4, StandardCharsets.ISO_8859_1).equals("qt  ");
            return quickTime ? new Video(bytes, "video/quicktime", "mov") : new Video(bytes, "video/mp4", "mp4");
        }
        if (bytes.length >= 4 && Arrays.equals(Arrays.copyOf(bytes, 4), WEBM)) {
            return new Video(bytes, "video/webm", "webm");
        }
        throw new DeliveryPhotoException(
                HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Only MP4, MOV and WebM videos are supported");
    }
}
