package com.friendoncampus.credit.web;

import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.friendoncampus.credit.domain.CreditAccount;
import com.friendoncampus.credit.domain.CreditLedgerEntry;
import com.friendoncampus.credit.service.CreditQueryService;
import com.friendoncampus.credit.service.InitialCreditAllocationService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;

@RestController
@RequestMapping("/api/credits/me")
@SecurityRequirement(name = "bearerAuth")
public class CreditController {

    private final CreditQueryService queries;
    private final InitialCreditAllocationService allocations;

    public CreditController(CreditQueryService queries, InitialCreditAllocationService allocations) {
        this.queries = queries;
        this.allocations = allocations;
    }

    @PostMapping
    @Operation(summary = "Ensure the authenticated user has their one-time initial credit allocation")
    public CreditResponses.Balance activate(@AuthenticationPrincipal Jwt jwt) {
        UUID userId = subject(jwt);
        allocations.allocateForAuthenticatedUser(userId);
        return CreditResponses.Balance.from(queries.balance(userId));
    }

    @GetMapping
    @Operation(summary = "Get the authenticated user's credit balance")
    public CreditResponses.Balance balance(@AuthenticationPrincipal Jwt jwt) {
        CreditAccount account = queries.balance(subject(jwt));
        return CreditResponses.Balance.from(account);
    }

    @GetMapping("/transactions")
    @Operation(summary = "Get the authenticated user's immutable credit history")
    public CreditResponses.TransactionPage transactions(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Page<CreditLedgerEntry> entries = queries.transactions(subject(jwt), page, size);
        return CreditResponses.TransactionPage.from(entries);
    }

    private static UUID subject(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
