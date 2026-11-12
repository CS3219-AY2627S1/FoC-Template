/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), dates: 2026-09-26 to 2026-09-28
 * Scope: Generated initial Supplier Service implementation and tests.
 */

package com.campuscouriers.supplier.util;
import java.util.Locale;

public final class NameNormalizer {

    private NameNormalizer() {
    }

    public static String displayName(String value) {
        return value.trim().replaceAll("\\s+", " ");
    }

    public static String normalizedName(String value) {
        return displayName(value).toLowerCase(Locale.ROOT);
    }
}
