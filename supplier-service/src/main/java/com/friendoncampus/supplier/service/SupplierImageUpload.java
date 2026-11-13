package com.friendoncampus.supplier.service;

import java.io.IOException;
import java.util.Arrays;

import org.springframework.web.multipart.MultipartFile;

public record SupplierImageUpload(String contentType, byte[] content) {

    public static final long MAX_SIZE_BYTES = 5L * 1024L * 1024L;

    public static SupplierImageUpload from(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new InvalidSupplierImageException("Choose a non-empty image file");
        }
        if (file.getSize() > MAX_SIZE_BYTES) {
            throw new InvalidSupplierImageException("Image must be 5 MB or smaller");
        }

        try {
            byte[] content = file.getBytes();
            String detectedType = detectContentType(content);
            String declaredType = file.getContentType();
            if (declaredType != null && !declaredType.isBlank()
                    && !declaredType.equalsIgnoreCase(detectedType)) {
                throw new InvalidSupplierImageException(
                        "Image contents do not match the declared file type");
            }
            return new SupplierImageUpload(detectedType, content);
        } catch (IOException exception) {
            throw new InvalidSupplierImageException("Image could not be read", exception);
        }
    }

    private static String detectContentType(byte[] bytes) {
        if (bytes.length >= 3
                && (bytes[0] & 0xff) == 0xff
                && (bytes[1] & 0xff) == 0xd8
                && (bytes[2] & 0xff) == 0xff) {
            return "image/jpeg";
        }
        byte[] pngSignature = {(byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a};
        if (bytes.length >= pngSignature.length
                && Arrays.equals(Arrays.copyOf(bytes, pngSignature.length), pngSignature)) {
            return "image/png";
        }
        if (bytes.length >= 12
                && asciiEquals(bytes, 0, "RIFF")
                && asciiEquals(bytes, 8, "WEBP")) {
            return "image/webp";
        }
        throw new InvalidSupplierImageException("Image must be a JPEG, PNG, or WebP file");
    }

    private static boolean asciiEquals(byte[] bytes, int offset, String expected) {
        for (int index = 0; index < expected.length(); index++) {
            if (bytes[offset + index] != (byte) expected.charAt(index)) {
                return false;
            }
        }
        return true;
    }
}
