/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-09-18 to 2026-10-03
 * Scope (AI-23): Generated code and tests for the User Service endpoints, entities, validation and token handling I specified.
 * Tool and date: Anthropic Claude (model unrecorded), 2026-11-10
 * Scope (AI-28): Generated the account list endpoint, admin users page and their tests.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.account;

import com.campuscouriers.user.account.dto.AccountPageResponse;
import com.campuscouriers.user.account.dto.AccountResponse;
import com.campuscouriers.user.account.dto.EmailResponse;
import com.campuscouriers.user.account.dto.UpdateAccountTypeRequest;
import com.campuscouriers.user.account.dto.UpdateEmailRequest;
import com.campuscouriers.user.entity.AccountType;
import com.campuscouriers.user.exception.EmailAlreadyRegisteredException;
import com.campuscouriers.user.exception.InsufficientPermissionException;
import com.campuscouriers.user.exception.InvalidAccountException;
import com.campuscouriers.user.exception.LastAdministratorException;
import com.campuscouriers.user.security.access.AccessTokenClaims;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

// GET lists accounts (Administrators only). Only PATCH is mapped on /{accountId} and /{accountId}/email;
// other methods there are rejected by Spring MVC with 405
@RestController
@RequestMapping("/api/v1/accounts")
public class AccountController {

    private final AccountService accountService;

    public AccountController(AccountService accountService) {
        this.accountService = accountService;
    }

    // Invalid parameters are rejected with 400 by Spring's built-in method validation
    @GetMapping
    public AccountPageResponse listAccounts(
            @RequestParam(required = false) @Size(max = 100) String search,
            @RequestParam(required = false) @Pattern(regexp = "Student|student|Administrator|administrator") String type,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size,
            @AuthenticationPrincipal AccessTokenClaims claims) {
        AccountType accountType = type == null ? null
                : type.equalsIgnoreCase("student") ? AccountType.Student : AccountType.Administrator;
        return accountService.listAccounts(search, accountType, page, size, claims);
    }

    @PatchMapping("/{accountId}")
    public AccountResponse updateType(@PathVariable UUID accountId,
                                      @Valid @RequestBody UpdateAccountTypeRequest request,
                                      @AuthenticationPrincipal AccessTokenClaims claims) {
        return accountService.updateType(accountId, request.accountType(), claims);
    }

    @PatchMapping("/{accountId}/email")
    public EmailResponse updateEmail(@PathVariable UUID accountId,
                                     @Valid @RequestBody UpdateEmailRequest request,
                                     @AuthenticationPrincipal AccessTokenClaims claims) {
        return accountService.updateEmail(accountId, request.email(), claims);
    }

    // For when the target account does not exist
    @ExceptionHandler(InvalidAccountException.class)
    public ProblemDetail handleInvalidAccount(InvalidAccountException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
    }

    // For when the caller is not an Administrator or is changing their own type,
    // or is changing the email of an account they do not own
    @ExceptionHandler(InsufficientPermissionException.class)
    public ProblemDetail handleInsufficientPermission(InsufficientPermissionException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, ex.getMessage());
    }

    // For when a demotion would leave zero administrators
    @ExceptionHandler(LastAdministratorException.class)
    public ProblemDetail handleLastAdministrator(LastAdministratorException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, ex.getMessage());
    }

    // For when the new email already belongs to another account
    @ExceptionHandler(EmailAlreadyRegisteredException.class)
    public ProblemDetail handleEmailAlreadyRegistered(EmailAlreadyRegisteredException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, ex.getMessage());
    }

}
