package com.cs3219.foc.order.infrastructure.client;

import com.cs3219.foc.order.config.ErrandAiProperties;
import com.cs3219.foc.order.exception.ErrandAiException;
import com.cs3219.foc.order.model.dto.AiChatRequest;
import com.cs3219.foc.order.model.dto.ErrandAiModelResponse;
import com.cs3219.foc.order.model.dto.ErrandDraftDto;
import com.openai.client.OpenAIClient;
import com.openai.client.okhttp.OpenAIOkHttpClient;
import com.openai.core.JsonValue;
import com.openai.core.MultipartField;
import com.openai.errors.OpenAIException;
import com.openai.errors.OpenAIServiceException;
import com.openai.models.audio.transcriptions.TranscriptionCreateParams;
import com.openai.models.responses.*;
import jakarta.annotation.PreDestroy;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

@Component
public class OpenAiGateway {
    private static final Logger log = LoggerFactory.getLogger(OpenAiGateway.class);
    private final ErrandAiProperties properties;
    private final OpenAIClient client;
    private final JsonMapper mapper;
    private final String prompt;
    private final ResponseFormatTextJsonSchemaConfig format;

    @Autowired
    public OpenAiGateway(ErrandAiProperties properties, JsonMapper mapper) throws IOException {
        this(
                properties,
                mapper,
                properties.enabled() && !properties.apiKey().isBlank()
                        ? OpenAIOkHttpClient.builder()
                                .apiKey(properties.apiKey())
                                .timeout(properties.timeout())
                                .maxRetries(0)
                                .build()
                        : null);
    }

    OpenAiGateway(ErrandAiProperties properties, JsonMapper mapper, OpenAIClient client) throws IOException {
        this.properties = properties;
        this.mapper = mapper;
        this.client = client;
        prompt = new ClassPathResource("ai/errand-assistant-prompt.txt").getContentAsString(StandardCharsets.UTF_8);
        var schema = ResponseFormatTextJsonSchemaConfig.Schema.builder();
        var tree = mapper.readTree(
                new ClassPathResource("ai/errand-assistant.schema.json").getContentAsString(StandardCharsets.UTF_8));
        tree.properties()
                .forEach(entry -> schema.putAdditionalProperty(
                        entry.getKey(), JsonValue.from(mapper.convertValue(entry.getValue(), Object.class))));
        format = ResponseFormatTextJsonSchemaConfig.builder()
                .name("errand_draft")
                .strict(true)
                .schema(schema.build())
                .build();
    }

    public ErrandAiModelResponse chat(AiChatRequest request, List<ErrandDraftDto.Pickup> suppliers) {
        if (client == null || !properties.chatAvailable()) throw ErrandAiException.unavailable();
        long started = System.nanoTime();
        try {
            var response = client.responses()
                    .create(ResponseCreateParams.builder()
                            .model(properties.model())
                            .store(false)
                            .instructions(prompt)
                            .input(mapper.writeValueAsString(Map.of("request", request, "activeSuppliers", suppliers)))
                            .text(ResponseTextConfig.builder().format(format).build())
                            .maxOutputTokens(4000)
                            .build());
            if (!response.status().filter(ResponseStatus.COMPLETED::equals).isPresent()
                    || response.error().isPresent()
                    || response.incompleteDetails().isPresent()) {
                throw ErrandAiException.invalidResponse();
            }
            var content = response.output().stream()
                    .flatMap(item -> item.message().stream())
                    .flatMap(message -> message.content().stream())
                    .toList();
            if (content.stream().anyMatch(item -> item.refusal().isPresent())) {
                throw new ErrandAiException(
                        HttpStatus.BAD_GATEWAY,
                        "AI_REFUSED",
                        "The assistant could not help with that message. Rephrase it or continue in the form.");
            }
            String json = content.stream()
                    .flatMap(item -> item.outputText().stream())
                    .map(ResponseOutputText::text)
                    .collect(Collectors.joining());
            return mapper.readValue(json, ErrandAiModelResponse.class);
        } catch (OpenAIException exception) {
            throw upstream("chat", started, exception);
        } catch (JacksonException exception) {
            throw ErrandAiException.invalidResponse();
        }
    }

    public String transcribe(byte[] bytes, String filename, String contentType) {
        if (client == null || !properties.transcriptionAvailable()) throw ErrandAiException.unavailable();
        long started = System.nanoTime();
        try {
            return client.audio()
                    .transcriptions()
                    .create(TranscriptionCreateParams.builder()
                            .model(properties.transcriptionModel())
                            .file(MultipartField.<InputStream>builder()
                                    .value(new ByteArrayInputStream(bytes))
                                    .filename(filename)
                                    .contentType(contentType)
                                    .build())
                            .build())
                    .asTranscription()
                    .text();
        } catch (OpenAIException exception) {
            throw upstream("transcription", started, exception);
        }
    }

    private ErrandAiException upstream(String operation, long started, OpenAIException exception) {
        var failure = mapUpstreamError(exception);
        Integer status = null;
        String requestId = null;
        if (exception instanceof OpenAIServiceException service) {
            status = service.statusCode();
            requestId = service.headers().values("x-request-id").stream()
                    .filter(id -> id.matches("[A-Za-z0-9_-]{1,128}"))
                    .findFirst()
                    .orElse(null);
        }
        log.warn(
                "OpenAI call failed operation={} category={} status={} requestId={} elapsedMs={}",
                operation,
                failure.getCode(),
                status,
                requestId,
                TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started));
        return failure;
    }

    private ErrandAiException mapUpstreamError(OpenAIException exception) {
        if (exception instanceof OpenAIServiceException service && service.statusCode() == 429) {
            return new ErrandAiException(
                    HttpStatus.TOO_MANY_REQUESTS,
                    "AI_RATE_LIMITED",
                    "The assistant is busy. Try again shortly or continue in the form.");
        }
        for (Throwable cause = exception; cause != null; cause = cause.getCause()) {
            if (cause instanceof InterruptedIOException) {
                return new ErrandAiException(
                        HttpStatus.GATEWAY_TIMEOUT,
                        "AI_TIMEOUT",
                        "The assistant took too long. Try again or continue in the form.");
            }
        }
        return new ErrandAiException(
                HttpStatus.BAD_GATEWAY,
                "AI_UPSTREAM_ERROR",
                "The assistant is temporarily unavailable. Try again or continue in the form.");
    }

    @PreDestroy
    public void close() {
        if (client != null) client.close();
    }
}
