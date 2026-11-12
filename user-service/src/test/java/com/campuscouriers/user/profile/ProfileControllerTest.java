/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-09-18 to 2026-10-03
 * Scope (AI-23): Generated code and tests for the User Service endpoints, entities, validation and token handling I specified.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.profile;

import com.campuscouriers.user.entity.AccountType;
import com.campuscouriers.user.exception.InsufficientPermissionException;
import com.campuscouriers.user.exception.InvalidAccessTokenException;
import com.campuscouriers.user.exception.InvalidProfileException;
import com.campuscouriers.user.profile.dto.NameResponse;
import com.campuscouriers.user.profile.dto.ProfileResponse;
import com.campuscouriers.user.security.SecurityConfig;
import com.campuscouriers.user.security.access.AccessTokenClaims;
import com.campuscouriers.user.security.access.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.util.UUID;

import static com.campuscouriers.user.TestConstants.VALID_EMAIL;
import static com.campuscouriers.user.TestConstants.VALID_NAME;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ProfileController.class)
@Import(SecurityConfig.class)
class ProfileControllerTest {

    @Autowired
    private MockMvc mockMvc;
    @MockitoBean
    private ProfileService profileService;
    @MockitoBean
    private JwtService jwtService;    // stubbed so requests authenticate through the real JwtAuthenticationFilter

    private static final String VALID_TOKEN = "valid-token";
    private final UUID profileId = new UUID(0L, 1L);
    private final AccessTokenClaims claims = new AccessTokenClaims(profileId, VALID_EMAIL, AccountType.Student);

    @BeforeEach
    void stubTokenValidation() {
        lenient().when(jwtService.parseAndValidate(VALID_TOKEN)).thenReturn(claims);
    }

    @Nested
    @DisplayName("F5 - View Profile: GET /api/v1/profiles/me")
    class GetMyProfileTests {

        @Test
        void getMyProfile_withValidToken_returns200WithNameAndEmail() throws Exception {
            when(profileService.getMyProfile(claims)).thenReturn(new ProfileResponse(VALID_NAME, VALID_EMAIL));

            mockMvc.perform(get("/api/v1/profiles/me")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + VALID_TOKEN))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.name").value(VALID_NAME))
                    .andExpect(jsonPath("$.email").value(VALID_EMAIL));

            verify(profileService).getMyProfile(claims);
            verify(profileService, never()).getProfile(any(), any());
        }

        @Test
        void getMyProfile_withMissingProfile_returns404() throws Exception {
            when(profileService.getMyProfile(claims)).thenThrow(new InvalidProfileException());

            mockMvc.perform(get("/api/v1/profiles/me")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + VALID_TOKEN))
                    .andExpect(status().isNotFound());
        }
    }

    @Nested
    @DisplayName("F5 - View Profile: /api/v1/profiles/{profileId}")
    class GetProfileTests {

        @Test
        void getProfile_whenPermitted_returns200WithNameAndEmail() throws Exception {
            when(profileService.getProfile(profileId, claims)).thenReturn(new ProfileResponse(VALID_NAME, VALID_EMAIL));

            mockMvc.perform(get("/api/v1/profiles/{id}", profileId)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + VALID_TOKEN))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.name").value(VALID_NAME))
                    .andExpect(jsonPath("$.email").value(VALID_EMAIL));

            verify(profileService).getProfile(profileId, claims);
        }

        @DisplayName("Neither owner nor Administrator, or profile does not exist, returns 404")
        @Test
        void getProfile_whenServiceRejects_returns404() throws Exception {
            UUID otherProfileId = new UUID(0L, 2L);
            when(profileService.getProfile(otherProfileId, claims)).thenThrow(new InvalidProfileException());

            mockMvc.perform(get("/api/v1/profiles/{id}", otherProfileId)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + VALID_TOKEN))
                    .andExpect(status().isNotFound());
        }

        @Test
        void getProfile_withMalformedId_returns400() throws Exception {
            mockMvc.perform(get("/api/v1/profiles/not-a-uuid")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + VALID_TOKEN))
                    .andExpect(status().isBadRequest());

            verifyNoInteractions(profileService);
        }
    }

    @Nested
    @DisplayName("Requests shall be authenticated with a Bearer access token")
    class AuthenticationTests {

        @ParameterizedTest
        @ValueSource(strings = {"/api/v1/profiles/me", "/api/v1/profiles/00000000-0000-0000-0000-000000000001"})
        void profiles_withoutAccessToken_returns401(String path) throws Exception {
            mockMvc.perform(get(path))
                    .andExpect(status().isUnauthorized());

            verifyNoInteractions(profileService);
        }

        @ParameterizedTest
        @ValueSource(strings = {"/api/v1/profiles/me", "/api/v1/profiles/00000000-0000-0000-0000-000000000001"})
        void profiles_withInvalidAccessToken_returns401(String path) throws Exception {
            when(jwtService.parseAndValidate("bad-token")).thenThrow(new InvalidAccessTokenException());

            mockMvc.perform(get(path)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer bad-token"))
                    .andExpect(status().isUnauthorized());

            verifyNoInteractions(profileService);
        }
    }

    @Nested
    @DisplayName("Edit Profile Name: PATCH /api/v1/profiles/{profileId}/name")
    class UpdateNameTests {

        private static final String NEW_NAME = "Alice Lim";

        @Test
        void updateName_withValidName_returns200WithTheName() throws Exception {
            when(profileService.updateName(profileId, NEW_NAME, claims)).thenReturn(new NameResponse(NEW_NAME));

            patchName(profileId.toString(), nameBody(NEW_NAME))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.name").value(NEW_NAME))
                    .andExpect(jsonPath("$.email").doesNotExist());

            verify(profileService).updateName(profileId, NEW_NAME, claims);
        }

        @DisplayName("A name of exactly 50 characters is accepted, as at registration")
        @Test
        void updateName_withMaximumLengthName_returns200() throws Exception {
            String name = "a".repeat(50);
            when(profileService.updateName(profileId, name, claims)).thenReturn(new NameResponse(name));

            patchName(profileId.toString(), nameBody(name))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.name").value(name));
        }

        @Test
        void updateName_withExtraFields_ignoresThemAndReturns200() throws Exception {
            when(profileService.updateName(profileId, NEW_NAME, claims)).thenReturn(new NameResponse(NEW_NAME));

            patchName(profileId.toString(), """
                    {"name":"Alice Lim","email":"hacker@u.nus.edu","id":"00000000-0000-0000-0000-000000000009"}
                    """)
                    .andExpect(status().isOk());

            verify(profileService).updateName(profileId, NEW_NAME, claims);
        }

        @ParameterizedTest
        @ValueSource(strings = {"", " ", "   "})
        void updateName_withBlankName_returns400(String name) throws Exception {
            patchName(profileId.toString(), nameBody(name))
                    .andExpect(status().isBadRequest());

            verifyNoInteractions(profileService);
        }

        @Test
        void updateName_withNameOver50Characters_returns400() throws Exception {
            patchName(profileId.toString(), nameBody("a".repeat(51)))
                    .andExpect(status().isBadRequest());

            verifyNoInteractions(profileService);
        }

        @ParameterizedTest
        @ValueSource(strings = {"{}", "{\"name\":null}", "{\"fullName\":\"Alice\"}", "", "{\"name\":", "{\"name\":[\"Alice\"]}"})
        void updateName_withMissingOrUnreadableName_returns400(String content) throws Exception {
            patchName(profileId.toString(), content)
                    .andExpect(status().isBadRequest());

            verifyNoInteractions(profileService);
        }

        @Test
        void updateName_withMalformedProfileId_returns400() throws Exception {
            patchName("not-a-uuid", nameBody(NEW_NAME))
                    .andExpect(status().isBadRequest());

            verifyNoInteractions(profileService);
        }

        @Test
        void updateName_asNonOwner_returns403() throws Exception {
            UUID otherProfileId = new UUID(0L, 2L);
            when(profileService.updateName(otherProfileId, NEW_NAME, claims))
                    .thenThrow(new InsufficientPermissionException());

            patchName(otherProfileId.toString(), nameBody(NEW_NAME))
                    .andExpect(status().isForbidden());
        }

        @Test
        void updateName_withMissingProfile_returns404() throws Exception {
            when(profileService.updateName(profileId, NEW_NAME, claims)).thenThrow(new InvalidProfileException());

            patchName(profileId.toString(), nameBody(NEW_NAME))
                    .andExpect(status().isNotFound());
        }

        @Test
        void updateName_withoutAccessToken_returns401() throws Exception {
            mockMvc.perform(patch("/api/v1/profiles/{id}/name", profileId)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(nameBody(NEW_NAME)))
                    .andExpect(status().isUnauthorized());

            verifyNoInteractions(profileService);
        }

        @Test
        void updateName_withInvalidAccessToken_returns401() throws Exception {
            when(jwtService.parseAndValidate("bad-token")).thenThrow(new InvalidAccessTokenException());

            mockMvc.perform(patch("/api/v1/profiles/{id}/name", profileId)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer bad-token")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(nameBody(NEW_NAME)))
                    .andExpect(status().isUnauthorized());

            verifyNoInteractions(profileService);
        }

        @ParameterizedTest
        @ValueSource(strings = {"GET", "POST", "PUT", "DELETE"})
        void name_withOtherMethods_returns405(String method) throws Exception {
            mockMvc.perform(request(HttpMethod.valueOf(method), "/api/v1/profiles/{id}/name", profileId)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + VALID_TOKEN)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(nameBody(NEW_NAME)))
                    .andExpect(status().isMethodNotAllowed());

            verifyNoInteractions(profileService);
        }
    }

    // ---- Helpers ----
    private static String nameBody(String name) {
        return String.format("""
                {"name":"%s"}
                """, name);
    }

    private ResultActions patchName(String profileId, String content) throws Exception {
        return mockMvc.perform(patch("/api/v1/profiles/" + profileId + "/name")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + VALID_TOKEN)
                .contentType(MediaType.APPLICATION_JSON)
                .content(content));
    }

}
