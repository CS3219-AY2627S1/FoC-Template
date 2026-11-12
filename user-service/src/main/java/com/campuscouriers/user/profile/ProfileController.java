/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-09-18 to 2026-10-03
 * Scope (AI-23): Generated code and tests for the User Service endpoints, entities, validation and token handling I specified.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.profile;

import com.campuscouriers.user.exception.InsufficientPermissionException;
import com.campuscouriers.user.exception.InvalidProfileException;
import com.campuscouriers.user.profile.dto.NameResponse;
import com.campuscouriers.user.profile.dto.ProfileResponse;
import com.campuscouriers.user.profile.dto.UpdateNameRequest;
import com.campuscouriers.user.security.access.AccessTokenClaims;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/profiles")
public class ProfileController {

    private final ProfileService profileService;

    public ProfileController(ProfileService profileService) {
        this.profileService = profileService;
    }

    @GetMapping("/me")
    public ProfileResponse getMyProfile(@AuthenticationPrincipal AccessTokenClaims claims) {
        return profileService.getMyProfile(claims);
    }

    @GetMapping("/{profileId}")
    public ProfileResponse getProfile(@PathVariable UUID profileId, @AuthenticationPrincipal AccessTokenClaims claims) {
        return profileService.getProfile(profileId, claims);
    }

    @PatchMapping("/{profileId}/name")
    public NameResponse updateName(@PathVariable UUID profileId,
                                   @Valid @RequestBody UpdateNameRequest request,
                                   @AuthenticationPrincipal AccessTokenClaims claims) {
        return profileService.updateName(profileId, request.name(), claims);
    }

    // For when the profile does not exist, or a GET caller is neither the owner nor an Administrator
    @ExceptionHandler(InvalidProfileException.class)
    public ProblemDetail handleInvalidProfile(InvalidProfileException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
    }

    // For when the caller is not the owner of the profile being modified
    @ExceptionHandler(InsufficientPermissionException.class)
    public ProblemDetail handleInsufficientPermission(InsufficientPermissionException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, ex.getMessage());
    }

}
