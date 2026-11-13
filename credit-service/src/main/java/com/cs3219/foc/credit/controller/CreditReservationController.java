package com.cs3219.foc.credit.controller;

import com.cs3219.foc.credit.model.dto.CreditReservationResponse;
import com.cs3219.foc.credit.model.dto.ReserveCreditRequest;
import com.cs3219.foc.credit.service.CreditReservationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/credits/reservations")
@RequiredArgsConstructor
public class CreditReservationController {
    private final CreditReservationService service;

    @PostMapping
    public CreditReservationResponse reserve(@Valid @RequestBody ReserveCreditRequest request) {
        return service.reserve(request);
    }
}
