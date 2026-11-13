package com.cs3219.foc.order.controller;

import com.cs3219.foc.order.model.dto.*;
import com.cs3219.foc.order.service.OrderDisputeService;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/orders")
@RequiredArgsConstructor
public class OrderDisputeController {
    private final OrderDisputeService service;

    @PostMapping("/{orderId}/disputes")
    public OrderDisputeDto report(@PathVariable UUID orderId, @Valid @RequestBody ReportDisputeRequest request) {
        return service.report(orderId, request);
    }

    @GetMapping("/disputes")
    public PageDto<OrderDisputeDto> list(@PageableDefault(size = 20) Pageable pageable) {
        return service.list(pageable);
    }

    @PostMapping("/disputes/{id}/response")
    public OrderDisputeDto respond(@PathVariable UUID id, @Valid @RequestBody RespondToDisputeRequest request) {
        return service.respond(id, request);
    }

    @PostMapping("/disputes/{id}/resolve")
    public OrderDisputeDto resolve(@PathVariable UUID id, @Valid @RequestBody ResolveDisputeRequest request) {
        return service.resolve(id, request);
    }
}
