package com.cs3219.foc.supplier.service;

import com.cs3219.foc.supplier.exception.SupplierImageException;
import java.awt.Color;
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
public class SupplierImageProcessor {
    static final int MAX_BYTES = 5 * 1024 * 1024;
    private static final int MAX_DIMENSION = 6000;
    private static final int OUTPUT_DIMENSION = 1200;

    public byte[] processSupplierImage(MultipartFile file) {
        if (file.isEmpty()) {
            throw new SupplierImageException(HttpStatus.BAD_REQUEST, "Image file is required");
        }
        try (var stream = file.getInputStream()) {
            var bytes = stream.readNBytes(MAX_BYTES + 1);
            if (bytes.length > MAX_BYTES) {
                throw new SupplierImageException(HttpStatus.CONTENT_TOO_LARGE, "Image must not exceed 5 MB");
            }
            return reencodeAsJpeg(bytes);
        } catch (IOException | IllegalArgumentException exception) {
            throw new SupplierImageException(HttpStatus.BAD_REQUEST, "Image could not be decoded", exception);
        }
    }

    private static byte[] reencodeAsJpeg(byte[] bytes) throws IOException {
        try (var input = new MemoryCacheImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) {
                throw new SupplierImageException(
                        HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Only JPEG and PNG images are supported");
            }

            var reader = readers.next();
            try {
                var format = reader.getFormatName().toLowerCase(Locale.ROOT);
                if (!format.equals("jpeg") && !format.equals("png")) {
                    throw new SupplierImageException(
                            HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Only JPEG and PNG images are supported");
                }

                reader.setInput(input, true, true);
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                if (width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
                    throw new SupplierImageException(
                            HttpStatus.BAD_REQUEST, "Image dimensions must not exceed 6000 by 6000 pixels");
                }

                var decoded = reader.read(0);
                double scale = Math.min(1.0, (double) OUTPUT_DIMENSION / Math.max(width, height));
                var resized = new BufferedImage(
                        Math.max(1, (int) Math.round(width * scale)),
                        Math.max(1, (int) Math.round(height * scale)),
                        BufferedImage.TYPE_INT_RGB);

                var graphics = resized.createGraphics();
                try {
                    graphics.setColor(Color.WHITE);
                    graphics.fillRect(0, 0, resized.getWidth(), resized.getHeight());
                    graphics.setRenderingHint(
                            RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
                    graphics.drawImage(decoded, 0, 0, resized.getWidth(), resized.getHeight(), null);
                } finally {
                    graphics.dispose();
                    decoded.flush();
                }

                try (var output = new ByteArrayOutputStream()) {
                    if (!ImageIO.write(resized, "jpg", output)) {
                        throw new SupplierImageException(
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
    }
}
