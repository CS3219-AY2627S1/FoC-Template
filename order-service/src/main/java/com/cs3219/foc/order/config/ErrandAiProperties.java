package com.cs3219.foc.order.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("orders.ai")
public record ErrandAiProperties(
        @DefaultValue("false") boolean enabled,
        @DefaultValue("") String apiKey,
        String model,
        String transcriptionModel,
        @DefaultValue("30s") Duration timeout,
        @DefaultValue("8388608") long maxAudioBytes) {
    public boolean chatAvailable() {
        return enabled && apiKey != null && !apiKey.isBlank() && model != null && !model.isBlank();
    }

    public boolean transcriptionAvailable() {
        return enabled
                && apiKey != null
                && !apiKey.isBlank()
                && transcriptionModel != null
                && !transcriptionModel.isBlank();
    }

    @Override
    public String toString() {
        return "ErrandAiProperties[enabled=" + enabled + ", model=" + model + ", apiKey=<redacted>]";
    }
}
