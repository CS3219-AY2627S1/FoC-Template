package com.cs3219.foc.order.service;

import com.cs3219.foc.order.config.ErrandAiProperties;
import com.cs3219.foc.order.exception.ErrandAiException;
import com.cs3219.foc.order.infrastructure.client.OpenAiGateway;
import com.cs3219.foc.order.infrastructure.client.SupplierClient;
import com.cs3219.foc.order.model.dto.*;
import jakarta.validation.Validator;
import java.io.IOException;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ErrandAiService {
    private static final Set<Integer> EXPIRY_MINUTES = Set.of(30, 60, 120, 240, 480);
    private final ErrandAiProperties properties;
    private final SupplierClient suppliers;
    private final OpenAiGateway gateway;
    private final Validator validator;

    public ErrandAiService(
            ErrandAiProperties properties, SupplierClient suppliers, OpenAiGateway gateway, Validator validator) {
        this.properties = properties;
        this.suppliers = suppliers;
        this.gateway = gateway;
        this.validator = validator;
    }

    public AiCapabilitiesResponse capabilities() {
        boolean chatEnabled = properties.chatAvailable();
        return new AiCapabilitiesResponse(chatEnabled, chatEnabled && properties.transcriptionAvailable());
    }

    public AiChatResponse chat(AiChatRequest request) {
        if (!properties.chatAvailable()) throw ErrandAiException.unavailable();
        if (!validator.validate(request).isEmpty()
                || request.history().stream()
                                .mapToInt(m -> m.content().length())
                                .sum()
                        > AiChatRequest.MAX_HISTORY_CHARACTERS
                || !validExpiry(request.draft().expiryMinutes())) {
            throw new ErrandAiException(HttpStatus.BAD_REQUEST, "AI_INVALID_INPUT", "Invalid chat input.");
        }
        var locations = suppliers.listActive().stream()
                .filter(SupplierPickupDto::active)
                .collect(Collectors.toMap(
                        SupplierPickupDto::id, this::pickup, (first, second) -> first, LinkedHashMap::new));
        var selectedId = request.selectedSupplierId();
        if (selectedId != null && !locations.containsKey(selectedId)) {
            throw new ErrandAiException(
                    HttpStatus.BAD_REQUEST,
                    "AI_SUPPLIER_UNAVAILABLE",
                    "That pickup location is no longer available. Choose another location.");
        }
        // Rebuild display data from the supplier service; client labels are not authoritative.
        var original = request.draft();
        var currentPickup = original.pickup() == null
                ? null
                : locations.get(original.pickup().id());
        if (selectedId != null) currentPickup = locations.get(selectedId);
        var current = new ErrandDraftDto(
                currentPickup,
                original.deliveryLocation(),
                original.description(),
                original.notes(),
                original.creditReward(),
                original.expiryMinutes());
        var input = new AiChatRequest(request.message(), request.history(), current, selectedId);
        var result = gateway.chat(input, List.copyOf(locations.values()));
        if (result == null
                || !validator.validate(result).isEmpty()
                || !validExpiry(result.draft().expiryMinutes())) throw ErrandAiException.invalidResponse();
        var draft = result.draft();
        if (selectedId != null && !selectedId.equals(draft.supplierId())) throw ErrandAiException.invalidResponse();
        if (draft.supplierId() != null && !locations.containsKey(draft.supplierId())) {
            throw ErrandAiException.invalidResponse();
        }
        var normalized = new ErrandDraftDto(
                draft.supplierId() == null ? null : locations.get(draft.supplierId()),
                trim(draft.deliveryLocation()),
                trim(draft.description()),
                trim(draft.notes()),
                draft.creditReward(),
                draft.expiryMinutes());
        var choices = result.supplierChoiceIds().stream()
                .distinct()
                .filter(locations::containsKey)
                .map(locations::get)
                .toList();
        var missing = new ArrayList<String>();
        if (normalized.pickup() == null) missing.add("pickup");
        if (blank(normalized.deliveryLocation())) missing.add("deliveryLocation");
        if (blank(normalized.description())) missing.add("description");
        if (normalized.creditReward() == null) missing.add("creditReward");
        if (normalized.expiryMinutes() == null) missing.add("expiryMinutes");
        return new AiChatResponse(result.message().trim(), normalized, List.copyOf(missing), choices);
    }

    public TranscriptionResponse transcribe(MultipartFile file) {
        if (!properties.transcriptionAvailable()) throw ErrandAiException.unavailable();
        if (file.isEmpty())
            throw new ErrandAiException(HttpStatus.BAD_REQUEST, "AI_EMPTY_AUDIO", "Record some audio first.");
        if (file.getSize() > properties.maxAudioBytes()) {
            throw new ErrandAiException(
                    HttpStatus.PAYLOAD_TOO_LARGE, "AI_AUDIO_TOO_LARGE", "Recording exceeds the audio size limit.");
        }
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new ErrandAiException(HttpStatus.BAD_REQUEST, "AI_INVALID_AUDIO", "Unable to read the recording.");
        }
        String mime = Optional.ofNullable(file.getContentType())
                .orElse("")
                .split(";")[0]
                .trim()
                .toLowerCase(Locale.ROOT);
        boolean webm = bytes.length >= 4
                && (bytes[0] & 255) == 0x1a
                && (bytes[1] & 255) == 0x45
                && (bytes[2] & 255) == 0xdf
                && (bytes[3] & 255) == 0xa3;
        boolean mp4 = bytes.length >= 12 && bytes[4] == 'f' && bytes[5] == 't' && bytes[6] == 'y' && bytes[7] == 'p';
        String filename;
        if (webm && Set.of("audio/webm", "video/webm").contains(mime)) filename = "recording.webm";
        else if (mp4 && Set.of("audio/mp4", "video/mp4").contains(mime)) filename = "recording.mp4";
        else
            throw new ErrandAiException(
                    HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                    "AI_AUDIO_FORMAT",
                    "Use a supported WebM or MP4 recording, or type your message.");
        String text = gateway.transcribe(bytes, filename, mime).trim();
        if (text.isBlank())
            throw new ErrandAiException(
                    HttpStatus.BAD_GATEWAY,
                    "AI_EMPTY_TRANSCRIPT",
                    "No speech was recognized. Try again or type your message.");
        if (text.length() > 2000)
            throw new ErrandAiException(HttpStatus.BAD_GATEWAY, "AI_TRANSCRIPT_TOO_LONG", "Try a shorter recording.");
        return new TranscriptionResponse(text);
    }

    private ErrandDraftDto.Pickup pickup(SupplierPickupDto supplier) {
        String address = Stream.of(supplier.building(), supplier.floor(), supplier.locationDescription())
                .filter(s -> s != null && !s.isBlank())
                .collect(Collectors.joining(" · "));
        return new ErrandDraftDto.Pickup(supplier.id(), supplier.name(), address.isBlank() ? supplier.name() : address);
    }

    private boolean validExpiry(Integer minutes) {
        return minutes == null || EXPIRY_MINUTES.contains(minutes);
    }

    private String trim(String value) {
        return value == null ? null : value.trim();
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
