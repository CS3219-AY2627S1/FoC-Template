package com.cs3219.foc.user.service;

import com.cs3219.foc.user.exception.AvatarException;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Locale;
import javax.imageio.ImageIO;
import javax.imageio.stream.MemoryCacheImageInputStream;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

@Component
public class AvatarImageProcessor {
    private static final int MAX_BYTES = 2 * 1024 * 1024;
    private static final int MAX_DIMENSION = 4096;
    private static final int OUTPUT_DIMENSION = 512;

    public byte[] processAvatar(MultipartFile file) {
        if (file.isEmpty()) {
            throw new AvatarException(HttpStatus.BAD_REQUEST, "Image file is required");
        }
        try (var stream = file.getInputStream()) {
            var bytes = stream.readNBytes(MAX_BYTES + 1);
            if (bytes.length > MAX_BYTES) {
                throw new AvatarException(HttpStatus.CONTENT_TOO_LARGE, "Image must not exceed 2 MB");
            }
            try (var input = new MemoryCacheImageInputStream(new ByteArrayInputStream(bytes))) {
                var readers = ImageIO.getImageReaders(input);
                if (!readers.hasNext()) {
                    throw new AvatarException(
                            HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Only JPEG and PNG images are supported");
                }
                var reader = readers.next();
                try {
                    var format = reader.getFormatName().toLowerCase(Locale.ROOT);
                    if (!format.equals("jpeg") && !format.equals("png")) {
                        throw new AvatarException(
                                HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Only JPEG and PNG images are supported");
                    }
                    reader.setInput(input, true, true);
                    int width = reader.getWidth(0);
                    int height = reader.getHeight(0);
                    if (width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
                        throw new AvatarException(
                                HttpStatus.BAD_REQUEST, "Image dimensions must not exceed 4096 by 4096 pixels");
                    }
                    var decoded = reader.read(0);
                    double scale = Math.min(1.0, (double) OUTPUT_DIMENSION / Math.max(width, height));
                    var resized = new BufferedImage(
                            Math.max(1, (int) (width * scale)),
                            Math.max(1, (int) (height * scale)),
                            BufferedImage.TYPE_INT_ARGB);
                    var graphics = resized.createGraphics();
                    try {
                        graphics.setRenderingHint(
                                RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
                        graphics.drawImage(decoded, 0, 0, resized.getWidth(), resized.getHeight(), null);
                    } finally {
                        graphics.dispose();
                        decoded.flush();
                    }
                    try (var output = new ByteArrayOutputStream()) {
                        // Writing a new raster discards source metadata and appended content.
                        if (!ImageIO.write(resized, "png", output)) {
                            throw new AvatarException(
                                    HttpStatus.SERVICE_UNAVAILABLE, "Image processing is unavailable");
                        }
                        return output.toByteArray();
                    } finally {
                        resized.flush();
                    }
                } finally {
                    reader.dispose();
                }
            }
        } catch (IOException | IllegalArgumentException exception) {
            throw new AvatarException(HttpStatus.BAD_REQUEST, "Image could not be decoded", exception);
        }
    }
}
