/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-09-18 to 2026-10-03
 * Scope (AI-23): Generated code and tests for the User Service endpoints, entities, validation and token handling I specified.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.profile;

import com.campuscouriers.user.entity.AccountType;
import com.campuscouriers.user.entity.Profile;
import com.campuscouriers.user.exception.InsufficientPermissionException;
import com.campuscouriers.user.exception.InvalidProfileException;
import com.campuscouriers.user.profile.dto.NameResponse;
import com.campuscouriers.user.profile.dto.ProfileResponse;
import com.campuscouriers.user.repository.ProfileRepository;
import com.campuscouriers.user.security.access.AccessTokenClaims;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class ProfileService {

    private final ProfileRepository profileRepository;

    public ProfileService(ProfileRepository profileRepository) {
        this.profileRepository = profileRepository;
    }

    // Available to the profile's owner and to Administrators
    @Transactional(readOnly = true)
    public ProfileResponse getProfile(UUID profileId, AccessTokenClaims caller) {

        // Profile shares its id with its Account (@MapsId), so ownership is an id comparison
        boolean isOwner = profileId.equals(caller.accountId());
        boolean isAdministrator = caller.type() == AccountType.Administrator;

        // Checked before the lookup so non-owners cannot probe which profiles exist
        if (!isOwner && !isAdministrator) {
            throw new InvalidProfileException();
        }

        return profileRepository.findById(profileId)
                .map(this::toResponse)
                .orElseThrow(InvalidProfileException::new);
    }

    // Available to any authenticated user, for their own profile only
    @Transactional(readOnly = true)
    public ProfileResponse getMyProfile(AccessTokenClaims caller) {
        return profileRepository.findById(caller.accountId())
                .map(this::toResponse)
                .orElseThrow(InvalidProfileException::new);
    }

    // Available to the profile's owner only
    @Transactional
    public NameResponse updateName(UUID profileId, String name, AccessTokenClaims caller) {

        // Checked before the lookup so non-owners cannot probe which profiles exist
        if (!profileId.equals(caller.accountId())) {
            throw new InsufficientPermissionException();
        }

        Profile profile = profileRepository.findById(profileId)
                .orElseThrow(InvalidProfileException::new);

        profile.changeName(name);  // flushed on commit
        return new NameResponse(profile.getName());
    }

    private ProfileResponse toResponse(Profile profile) {
        return new ProfileResponse(profile.getName(), profile.getAccount().getEmail());
    }

}
