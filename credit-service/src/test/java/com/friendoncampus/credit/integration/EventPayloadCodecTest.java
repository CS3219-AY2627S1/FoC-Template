package com.friendoncampus.credit.integration;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.json.JsonMapper;

class EventPayloadCodecTest {

    private final EventPayloadCodec codec = new EventPayloadCodec(JsonMapper.builder().build());

    @Test
    void canonicalizesObjectKeysRecursivelyWithoutReorderingArrays() {
        EventPayloadCodec.CanonicalPayload first = codec.canonicalize(
                "{\"requester\":{\"name\":\"Alice\",\"id\":\"abc\"},\"amounts\":[3,1]}");
        EventPayloadCodec.CanonicalPayload reordered = codec.canonicalize(
                "{\"amounts\":[3,1],\"requester\":{\"id\":\"abc\",\"name\":\"Alice\"}}");
        EventPayloadCodec.CanonicalPayload changedArray = codec.canonicalize(
                "{\"amounts\":[1,3],\"requester\":{\"id\":\"abc\",\"name\":\"Alice\"}}");

        assertThat(first).isEqualTo(reordered);
        assertThat(first.hash()).isNotEqualTo(changedArray.hash());
    }
}
