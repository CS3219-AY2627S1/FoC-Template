package com.cs3219.foc.order.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mock.env.MockEnvironment;

class ErrandAiPropertiesTests {
    private final MockEnvironment environment = new MockEnvironment()
            .withProperty("FOC_ORDER_AI_ENABLED", "true")
            .withProperty("OPENAI_API_KEY", "test-only");

    @BeforeEach
    void loadApplicationYaml() throws IOException {
        new YamlPropertySourceLoader()
                .load("order-service", new ClassPathResource("application.yaml"))
                .forEach(environment.getPropertySources()::addLast);
    }

    private ErrandAiProperties bind() {
        return Binder.get(environment)
                .bind("orders.ai", ErrandAiProperties.class)
                .get();
    }

    @Test
    void usesProjectModelsWhenOnlyEnabledAndKeyAreProvided() {
        var ai = bind();
        assertThat(ai.model()).isEqualTo("gpt-6.1-terra");
        assertThat(ai.transcriptionModel()).isEqualTo("gpt-transcribe");
        assertThat(ai.chatAvailable()).isTrue();
        assertThat(ai.transcriptionAvailable()).isTrue();
    }

    @Test
    void honorsExplicitModelOverrides() {
        environment.setProperty("FOC_ORDER_AI_MODEL", "test-chat");
        environment.setProperty("FOC_ORDER_AI_TRANSCRIPTION_MODEL", "test-voice");
        var ai = bind();
        assertThat(ai.model()).isEqualTo("test-chat");
        assertThat(ai.transcriptionModel()).isEqualTo("test-voice");
    }

    @Test
    void emptyTranscriptionOverrideDisablesOnlyVoice() {
        environment.setProperty("FOC_ORDER_AI_TRANSCRIPTION_MODEL", "");
        var ai = bind();
        assertThat(ai.chatAvailable()).isTrue();
        assertThat(ai.transcriptionModel()).isEmpty();
        assertThat(ai.transcriptionAvailable()).isFalse();
    }
}
