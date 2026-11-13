package com.cs3219.foc.order.controller;

import com.cs3219.foc.order.model.dto.*;
import com.cs3219.foc.order.service.ErrandAiService;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/orders/ai")
public class ErrandAiController {
    private final ErrandAiService service;

    public ErrandAiController(ErrandAiService service) {
        this.service = service;
    }

    @GetMapping("/capabilities")
    public AiCapabilitiesResponse capabilities() {
        return service.capabilities();
    }

    @PostMapping("/chat")
    public AiChatResponse chat(@Valid @RequestBody AiChatRequest request) {
        return service.chat(request);
    }

    @PostMapping(value = "/transcriptions", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public TranscriptionResponse transcribe(@RequestPart("file") MultipartFile file) {
        return service.transcribe(file);
    }
}
