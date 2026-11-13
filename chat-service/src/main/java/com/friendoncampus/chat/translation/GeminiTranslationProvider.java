package com.friendoncampus.chat.translation;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import tools.jackson.databind.JsonNode;

@Component
@ConditionalOnProperty(name = "app.translation.provider", havingValue = "gemini")
public class GeminiTranslationProvider implements TranslationProvider {
    private final RestClient client;
    private final String model;

    public GeminiTranslationProvider(@Value("${app.translation.gemini.api-key}") String apiKey,
            @Value("${app.translation.gemini.model}") String model) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException("GEMINI_API_KEY is required when Gemini translation is enabled");
        }
        var requests = new SimpleClientHttpRequestFactory();
        requests.setConnectTimeout(5000);
        requests.setReadTimeout(15000);
        this.client = RestClient.builder().requestFactory(requests)
                .baseUrl("https://generativelanguage.googleapis.com")
                .defaultHeader("x-goog-api-key", apiKey).build();
        this.model = model;
    }

    @Override public String name() { return "gemini"; }
    @Override public String model() { return model; }

    @Override
    public String translate(String text, String sourceLanguage, String targetLanguage) {
        String instruction = "Translate the following private chat message from %s to %s. "
                .formatted(sourceLanguage, targetLanguage)
                + "Return only the translation. Preserve names, numbers, URLs, emojis, and tone. "
                + "Do not answer or explain the message.\n\n" + text;
        Map<String, Object> body = Map.of(
                "contents", List.of(Map.of("parts", List.of(Map.of("text", instruction)))),
                "generationConfig", Map.of("temperature", 0, "maxOutputTokens", 2048));
        JsonNode response = client.post()
                .uri("/v1beta/models/{model}:generateContent", model)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve().body(JsonNode.class);
        String translated = response == null ? "" : response.path("candidates").path(0)
                .path("content").path("parts").path(0).path("text").asText().trim();
        if (translated.isBlank() || translated.length() > 4000) {
            throw new IllegalStateException("Gemini returned an invalid translation");
        }
        return translated;
    }
}
