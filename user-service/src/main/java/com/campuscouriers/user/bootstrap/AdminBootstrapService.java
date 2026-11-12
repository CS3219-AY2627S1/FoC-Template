/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-09-18 to 2026-10-03
 * Scope (AI-23): Generated code and tests for the User Service endpoints, entities, validation and token handling I specified.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.bootstrap;

import com.campuscouriers.user.account.AccountCreationService;
import com.campuscouriers.user.auth.dto.RegisterRequest;
import com.campuscouriers.user.entity.AccountType;
import com.campuscouriers.user.exception.AdminBootstrapException;
import com.campuscouriers.user.exception.EmailAlreadyRegisteredException;
import com.campuscouriers.user.repository.AccountRepository;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

// Creates the first Administrator from configuration; safe to run on every startup and from several instances at once
@Service
public class AdminBootstrapService {

    // Arbitrary application-wide key for pg_advisory_xact_lock; only needs to be unique within this database
    static final long ADVISORY_LOCK_KEY = 0x5553_4552_4144_4D4EL;

    public enum Outcome { CREATED, ADMIN_EXISTS, NOT_CONFIGURED }

    private final AccountRepository accountRepository;
    private final AccountCreationService accountCreationService;
    private final Validator validator;
    private final AdminBootstrapProperties properties;

    public AdminBootstrapService(
        AccountRepository accountRepository,
        AccountCreationService accountCreationService,
        Validator validator,
        AdminBootstrapProperties properties
    ) {
        this.accountRepository = accountRepository;
        this.accountCreationService = accountCreationService;
        this.validator = validator;
        this.properties = properties;
    }

    @Transactional
    public Outcome bootstrap() {

        // Configuration errors fail regardless of database state, so they are never silently ignored
        if (!properties.isUnset() && !properties.isComplete()) {
            throw new AdminBootstrapException(
                    "BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must be set together");
        }

        if (properties.isUnset()) {
            return accountRepository.existsByType(AccountType.Administrator) ? Outcome.ADMIN_EXISTS : Outcome.NOT_CONFIGURED;
        }

        // Same rules as self-registration (NUS email domain, password policy)
        RegisterRequest request = new RegisterRequest(properties.name(), properties.email(), properties.password());
        Set<ConstraintViolation<RegisterRequest>> violations = validator.validate(request);
        if (!violations.isEmpty()) {
            throw new AdminBootstrapException("Invalid bootstrap administrator configuration: " + describe(violations));
        }

        // Serializes concurrent bootstraps: a second instance waits here, then sees the committed administrator
        accountRepository.acquireTransactionLock(ADVISORY_LOCK_KEY);

        if (accountRepository.existsByType(AccountType.Administrator)) {
            return Outcome.ADMIN_EXISTS;
        }

        try {
            accountCreationService.create(AccountType.Administrator, request.email(), request.password(), request.name());
        } catch (EmailAlreadyRegisteredException ex) {
            // Promoting would hand administrator rights to whoever registered this email first
            throw new AdminBootstrapException("BOOTSTRAP_ADMIN_EMAIL " + properties.email()
                    + " already belongs to a non-administrator account; refusing to promote it. "
                    + "Use a different email, or promote an account through an existing administrator");
        }
        return Outcome.CREATED;
    }

    // Field names and constraint messages only, never the rejected values (which may include the password)
    private static String describe(Set<ConstraintViolation<RegisterRequest>> violations) {
        return violations.stream()
                .map(v -> "BOOTSTRAP_ADMIN_" + v.getPropertyPath().toString().toUpperCase(Locale.ROOT) + ": " + v.getMessage())
                .sorted()
                .collect(Collectors.joining("; "));
    }

}
