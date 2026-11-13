package com.cs3219.foc.order.controller;

import com.cs3219.foc.order.model.dto.*;
import com.cs3219.foc.order.service.ChatService;
import com.cs3219.foc.order.service.DeliveryService;
import com.cs3219.foc.order.service.OrderService;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/orders")
@RequiredArgsConstructor
public class OrderController {
    private final OrderService orderService;
    private final DeliveryService deliveryService;
    private final ChatService chatService;

    @PostMapping
    public ResponseEntity<CreateErrandResponse> create(@Valid @RequestBody CreateErrandRequest request) {
        CreateErrandResponse result = orderService.create(request);
        return ResponseEntity.ok().location(URI.create(result.queryUrl())).body(result);
    }

    @GetMapping
    public PageDto<ErrandDto> list(
            @RequestParam(required = false) UUID requesterId,
            @RequestParam(defaultValue = "") String q,
            @PageableDefault(
                            size = 20,
                            sort = {"createdAt", "id"},
                            direction = Sort.Direction.DESC)
                    Pageable pageable) {
        return orderService.list(requesterId, q, pageable);
    }

    @GetMapping("/mine")
    public PageDto<ErrandDto> mine(
            @RequestParam(defaultValue = "requester") String as,
            @RequestParam(defaultValue = "all") String view,
            @RequestParam(defaultValue = "") String q,
            @PageableDefault(
                            size = 20,
                            sort = {"createdAt", "id"},
                            direction = Sort.Direction.DESC)
                    Pageable pageable) {
        return orderService.mine(as, view, q, pageable);
    }

    @GetMapping("/{id}")
    public ErrandDto get(@PathVariable UUID id) {
        return orderService.get(id);
    }

    @PostMapping("/{id}/accept")
    public ErrandActionResponse accept(@PathVariable UUID id) {
        return orderService.accept(id);
    }

    @PostMapping("/{id}/retry-creation")
    public ResponseEntity<CreateErrandResponse> retryCreation(@PathVariable UUID id) {
        CreateErrandResponse result = orderService.retryCreation(id);
        return ResponseEntity.ok().location(URI.create(result.queryUrl())).body(result);
    }

    @PostMapping("/{id}/pick-up")
    public ErrandActionResponse pickUp(@PathVariable UUID id) {
        return orderService.pickUp(id);
    }

    // The courier can submit 1-5 photos as proof of delivery
    @PostMapping(path = "/{id}/deliver", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ErrandActionResponse deliver(@PathVariable UUID id, @RequestPart("photos") List<MultipartFile> photos) {
        return deliveryService.deliver(id, photos);
    }

    @GetMapping("/{id}/delivery-photos")
    public List<DeliveryPhotoDto> deliveryPhotos(@PathVariable UUID id) {
        return deliveryService.photos(id);
    }

    @GetMapping("/{id}/messages")
    public ChatDto chat(@PathVariable UUID id) {
        return chatService.chat(id);
    }

    @PostMapping("/{id}/messages")
    public ErrandMessageDto sendMessage(@PathVariable UUID id, @Valid @RequestBody SendMessageRequest request) {
        return chatService.send(id, request);
    }

    // A photo or video message: multi parts, code id + file
    @PostMapping(path = "/{id}/messages/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ErrandMessageDto sendAttachment(
            @PathVariable UUID id, @RequestParam("id") UUID messageId, @RequestPart("file") MultipartFile file) {
        return chatService.sendAttachment(id, messageId, file);
    }

    @PostMapping("/{id}/messages/read")
    public ResponseEntity<Void> markRead(@PathVariable UUID id, @Valid @RequestBody MarkReadRequest request) {
        chatService.markRead(id, request.messageId());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/complete")
    public ErrandActionResponse complete(@PathVariable UUID id) {
        return orderService.complete(id);
    }

    @PostMapping("/{id}/cancel")
    public ErrandActionResponse cancel(@PathVariable UUID id) {
        return orderService.cancel(id);
    }
}
