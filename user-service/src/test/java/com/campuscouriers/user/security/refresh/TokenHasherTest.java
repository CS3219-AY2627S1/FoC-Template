/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-09-18 to 2026-10-03
 * Scope (AI-23): Generated code and tests for the User Service endpoints, entities, validation and token handling I specified.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.security.refresh;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.AssertionsForClassTypes.assertThat;

public class TokenHasherTest {

    private final TokenHasher tokenHasher = new TokenHasher();

    @Test
    void hash_isDeterministic() {
        assertThat(tokenHasher.hash("abc-123")).isEqualTo(tokenHasher.hash("abc-123"));
    }

    @Test
    void hash_differsForDifferentInput() {
        assertThat(tokenHasher.hash("abc-123")).isNotEqualTo(tokenHasher.hash("abc-124"));
    }

    @Test
    void hash_doesNotReturnTheRawToken() {
        assertThat(tokenHasher.hash("abc-123")).isNotEqualTo("abc-123");
    }

}
