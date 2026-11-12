/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-09-18 to 2026-10-03
 * Scope (AI-23): Generated code and tests for the User Service endpoints, entities, validation and token handling I specified.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.profile;

import com.campuscouriers.user.entity.Account;
import com.campuscouriers.user.entity.AccountType;
import com.campuscouriers.user.entity.Profile;
import com.campuscouriers.user.exception.InsufficientPermissionException;
import com.campuscouriers.user.exception.InvalidProfileException;
import com.campuscouriers.user.profile.dto.NameResponse;
import com.campuscouriers.user.profile.dto.ProfileResponse;
import com.campuscouriers.user.repository.ProfileRepository;
import com.campuscouriers.user.security.access.AccessTokenClaims;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;
import java.util.UUID;

import static com.campuscouriers.user.TestConstants.VALID_EMAIL;
import static com.campuscouriers.user.TestConstants.VALID_NAME;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
public class ProfileServiceTest {

    @Mock private ProfileRepository profileRepository;

    @InjectMocks private ProfileService profileService;

    private final UUID ownerId = new UUID(0L, 1L);
    private final UUID otherId = new UUID(0L, 2L);

    private final AccessTokenClaims owner = new AccessTokenClaims(ownerId, VALID_EMAIL, AccountType.Student);
    private final AccessTokenClaims otherStudent = new AccessTokenClaims(otherId, "bob@u.nus.edu", AccountType.Student);
    private final AccessTokenClaims administrator = new AccessTokenClaims(otherId, "admin@u.nus.edu", AccountType.Administrator);

    @DisplayName("F5.1 - The user service shall return the profile to the profile owner or an administrator")
    @Nested
    class GetProfileTests {

        @Test
        void getProfile_asOwner_returnsNameAndEmail() {
            when(profileRepository.findById(ownerId)).thenReturn(Optional.of(profileFor(ownerId)));

            ProfileResponse response = profileService.getProfile(ownerId, owner);

            assertThat(response).isEqualTo(new ProfileResponse(VALID_NAME, VALID_EMAIL));
        }

        @Test
        void getProfile_asAdministrator_returnsAnotherUsersProfile() {
            when(profileRepository.findById(ownerId)).thenReturn(Optional.of(profileFor(ownerId)));

            ProfileResponse response = profileService.getProfile(ownerId, administrator);

            assertThat(response).isEqualTo(new ProfileResponse(VALID_NAME, VALID_EMAIL));
        }

        @Test
        void getProfile_asNonOwnerStudent_throwsWithoutQueryingTheRepository() {
            assertThatThrownBy(() -> profileService.getProfile(ownerId, otherStudent))
                    .isInstanceOf(InvalidProfileException.class);

            verifyNoInteractions(profileRepository);
        }

        @Test
        void getProfile_asOwnerWithMissingProfile_throws() {
            when(profileRepository.findById(ownerId)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> profileService.getProfile(ownerId, owner))
                    .isInstanceOf(InvalidProfileException.class);
        }

        @Test
        void getProfile_asAdministratorWithMissingProfile_throws() {
            when(profileRepository.findById(ownerId)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> profileService.getProfile(ownerId, administrator))
                    .isInstanceOf(InvalidProfileException.class);
        }
    }

    @DisplayName("F5.1 - The user service shall return to any authenticated user their own profile")
    @Nested
    class GetMyProfileTests {

        @Test
        void getMyProfile_returnsTheCallersProfile() {
            when(profileRepository.findById(ownerId)).thenReturn(Optional.of(profileFor(ownerId)));

            ProfileResponse response = profileService.getMyProfile(owner);

            assertThat(response).isEqualTo(new ProfileResponse(VALID_NAME, VALID_EMAIL));
        }

        @Test
        void getMyProfile_withMissingProfile_throws() {
            when(profileRepository.findById(ownerId)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> profileService.getMyProfile(owner))
                    .isInstanceOf(InvalidProfileException.class);
        }
    }

    @DisplayName("The user service shall allow only the profile owner to change the profile name")
    @Nested
    class UpdateNameTests {

        private static final String NEW_NAME = "Alice Lim";

        @Test
        void updateName_asOwner_changesAndReturnsTheName() {
            Profile profile = profileFor(ownerId);
            when(profileRepository.findById(ownerId)).thenReturn(Optional.of(profile));

            NameResponse response = profileService.updateName(ownerId, NEW_NAME, owner);

            assertThat(profile.getName()).isEqualTo(NEW_NAME);
            assertThat(response).isEqualTo(new NameResponse(NEW_NAME));
        }

        @Test
        void updateName_asNonOwnerStudent_throwsWithoutQueryingTheRepository() {
            assertThatThrownBy(() -> profileService.updateName(ownerId, NEW_NAME, otherStudent))
                    .isInstanceOf(InsufficientPermissionException.class);

            verifyNoInteractions(profileRepository);
        }

        @DisplayName("Administrators have no special access to other users' names")
        @Test
        void updateName_asAdministratorOnAnotherProfile_throwsWithoutQueryingTheRepository() {
            assertThatThrownBy(() -> profileService.updateName(ownerId, NEW_NAME, administrator))
                    .isInstanceOf(InsufficientPermissionException.class);

            verifyNoInteractions(profileRepository);
        }

        @Test
        void updateName_asOwnerWithMissingProfile_throws() {
            when(profileRepository.findById(ownerId)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> profileService.updateName(ownerId, NEW_NAME, owner))
                    .isInstanceOf(InvalidProfileException.class);
        }
    }

    // ---- Helpers ----
    private static Profile profileFor(UUID accountId) {
        Account account = new Account(AccountType.Student, VALID_EMAIL, "hashed-password");
        ReflectionTestUtils.setField(account, "id", accountId);
        Profile profile = new Profile(account, VALID_NAME);
        ReflectionTestUtils.setField(profile, "id", accountId);
        return profile;
    }

}
