/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Implementation.
 * Scope: Generated Reporting Service code for the team-specified reporting, association, storage, security, and administration contracts.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.report;

import java.io.IOException;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import sg.edu.nus.foc.reporting.error.BadRequestException;

@Component
public class ImageValidator {
    public static final int MAX_FILES = 5;
    public static final long MAX_BYTES = 5L * 1024 * 1024;

    public List<ValidatedImage> validate(List<MultipartFile> files) {
        List<MultipartFile> safe = files == null ? List.of() : files;
        if (safe.size() > MAX_FILES) throw new BadRequestException("At most five photos may be attached.", "photos");
        return safe.stream().map(this::validateOne).toList();
    }

    private ValidatedImage validateOne(MultipartFile file) {
        if (file == null || file.isEmpty()) throw new BadRequestException("Photos must not be empty.", "photos");
        if (file.getSize() > MAX_BYTES) throw new BadRequestException("Each photo must be 5 MiB or smaller.", "photos");
        String type = file.getContentType() == null ? "" : file.getContentType().toLowerCase(Locale.ROOT);
        if (!List.of("image/jpeg", "image/png", "image/webp").contains(type)) throw new BadRequestException("Only JPEG, PNG, or WebP photos are supported.", "photos");
        try {
            byte[] bytes = file.getBytes();
            if (!matches(type, bytes)) throw new BadRequestException("A photo's contents do not match its MIME type.", "photos");
            return new ValidatedImage(sanitize(file.getOriginalFilename(), type), type, bytes);
        } catch (IOException e) { throw new BadRequestException("A photo could not be read.", "photos"); }
    }

    static boolean matches(String type, byte[] b) {
        return switch (type) {
            case "image/jpeg" -> b.length >= 3 && u(b[0]) == 0xff && u(b[1]) == 0xd8 && u(b[2]) == 0xff;
            case "image/png" -> b.length >= 8 && u(b[0]) == 0x89 && b[1] == 0x50 && b[2] == 0x4e && b[3] == 0x47 && b[4] == 0x0d && b[5] == 0x0a && b[6] == 0x1a && b[7] == 0x0a;
            case "image/webp" -> b.length >= 12 && text(b, 0, "RIFF") && text(b, 8, "WEBP");
            default -> false;
        };
    }
    private static int u(byte b) { return b & 0xff; }
    private static boolean text(byte[] bytes, int start, String expected) {
        for (int i = 0; i < expected.length(); i++) if (bytes[start + i] != expected.charAt(i)) return false;
        return true;
    }
    static String sanitize(String original, String type) {
        String base = original == null ? "" : original.replace('\\', '/');
        base = base.substring(base.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}]", "").replaceAll("[^A-Za-z0-9._ -]", "_").strip();
        if (base.isBlank() || base.equals(".") || base.equals("..")) base = "photo." + switch (type) { case "image/png" -> "png"; case "image/webp" -> "webp"; default -> "jpg"; };
        return base.length() > 100 ? base.substring(base.length() - 100) : base;
    }
    public record ValidatedImage(String filename, String contentType, byte[] bytes) { public ValidatedImage { bytes = bytes.clone(); } }
}
