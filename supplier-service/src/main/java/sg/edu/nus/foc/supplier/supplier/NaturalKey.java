package sg.edu.nus.foc.supplier.supplier;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;

/**
 * Identity of a supplier by name + building (F1.1.2): two records may not share both.
 * Comparison ignores case, surrounding/duplicate whitespace and curly vs straight quotes.
 * The key is hashed so it is always a valid Firestore document ID.
 */
public final class NaturalKey {

    private NaturalKey() {
    }

    public static String of(String name, String building) {
        String canonical = normalise(name) + "\u0000" + normalise(building);
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    static String normalise(String value) {
        if (value == null) {
            return "";
        }
        return value.replace('’', '\'').replace('‘', '\'')
                .strip()
                .replaceAll("\\s+", " ")
                .toLowerCase(Locale.ROOT);
    }
}
