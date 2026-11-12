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
import com.campuscouriers.user.account.dto.AccountSummaryResponse;
import com.campuscouriers.user.account.dto.EmailResponse;
import com.campuscouriers.user.entity.AccountType;
import com.campuscouriers.user.exception.EmailAlreadyRegisteredException;
import com.campuscouriers.user.exception.InsufficientPermissionException;
import com.campuscouriers.user.exception.InvalidAccessTokenException;
import com.campuscouriers.user.exception.InvalidAccountException;
import com.campuscouriers.user.exception.LastAdministratorException;
import com.campuscouriers.user.security.SecurityConfig;
import com.campuscouriers.user.security.access.AccessTokenClaims;
import com.campuscouriers.user.security.access.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
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

import java.util.List;
import java.util.UUID;

import static com.campuscouriers.user.TestConstants.VALID_EMAIL;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AccountController.class)
@Import(SecurityConfig.class)
class AccountControllerTest {

    @Autowired
    private MockMvc mockMvc;
    @MockitoBean
    private AccountService accountService;
    @MockitoBean
    private JwtService jwtService;    // stubbed so requests authenticate through the real JwtAuthenticationFilter

    private static final String ADMIN_TOKEN = "admin-token";
    private static final String STUDENT_TOKEN = "student-token";
    private final UUID targetId = new UUID(0L, 2L);
    private final AccessTokenClaims administrator =
            new AccessTokenClaims(new UUID(0L, 1L), "admin@u.nus.edu", AccountType.Administrator);
    private final AccessTokenClaims student =
            new AccessTokenClaims(new UUID(0L, 3L), "bob@u.nus.edu", AccountType.Student);

    @BeforeEach
    void stubTokenValidation() {
        lenient().when(jwtService.parseAndValidate(ADMIN_TOKEN)).thenReturn(administrator);
        lenient().when(jwtService.parseAndValidate(STUDENT_TOKEN)).thenReturn(student);
    }

    @Nested
    @DisplayName("Valid requests return 200 with the updated account")
    class SuccessTests {

        @ParameterizedTest
        @CsvSource({
                "Student, Student",
                "student, Student",
                "Administrator, Administrator",
                "administrator, Administrator"
        })
        void updateType_withAcceptedSpelling_returns200WithUpdatedAccount(String value, AccountType expected) throws Exception {
            when(accountService.updateType(targetId, expected, administrator))
                    .thenReturn(new AccountResponse(targetId, VALID_EMAIL, expected));

            patchType(ADMIN_TOKEN, targetId.toString(), body(value))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").value(targetId.toString()))
                    .andExpect(jsonPath("$.email").value(VALID_EMAIL))
                    .andExpect(jsonPath("$.type").value(expected.name()));

            verify(accountService).updateType(targetId, expected, administrator);
        }

        @Test
        void updateType_withExtraFields_ignoresThemAndReturns200() throws Exception {
            when(accountService.updateType(targetId, AccountType.Student, administrator))
                    .thenReturn(new AccountResponse(targetId, VALID_EMAIL, AccountType.Student));

            patchType(ADMIN_TOKEN, targetId.toString(), """
                    {"type":"Student","email":"hacker@u.nus.edu","id":"00000000-0000-0000-0000-000000000009"}
                    """)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.email").value(VALID_EMAIL));

            verify(accountService).updateType(targetId, AccountType.Student, administrator);
        }
    }

    @Nested
    @DisplayName("Malformed requests return 400 before any permission check")
    class ValidationTests {

        @ParameterizedTest
        @ValueSource(strings = {"STUDENT", "ADMINISTRATOR", "admin", "Moderator", ""})
        void updateType_withInvalidTypeValue_returns400(String value) throws Exception {
            patchType(ADMIN_TOKEN, targetId.toString(), body(value))
                    .andExpect(status().isBadRequest());

            verifyNoInteractions(accountService);
        }

        @ParameterizedTest
        @ValueSource(strings = {"{}", "{\"type\":null}", "{\"role\":\"Student\"}", "", "{\"type\":", "{\"type\":[\"Student\"]}"})
        void updateType_withMissingOrUnreadableType_returns400(String content) throws Exception {
            patchType(ADMIN_TOKEN, targetId.toString(), content)
                    .andExpect(status().isBadRequest());

            verifyNoInteractions(accountService);
        }

        @DisplayName("A malformed body from a non-administrator is 400, not 403")
        @Test
        void updateType_asStudentWithInvalidBody_returns400() throws Exception {
            patchType(STUDENT_TOKEN, targetId.toString(), body("Moderator"))
                    .andExpect(status().isBadRequest());

            verifyNoInteractions(accountService);
        }

        @Test
        void updateType_withMalformedAccountId_returns400() throws Exception {
            patchType(ADMIN_TOKEN, "not-a-uuid", body("Student"))
                    .andExpect(status().isBadRequest());

            verifyNoInteractions(accountService);
        }
    }

    @Nested
    @DisplayName("Service exceptions map to 403, 404 and 409")
    class ExceptionMappingTests {

        @Test
        void updateType_withInsufficientPermission_returns403() throws Exception {
            when(accountService.updateType(targetId, AccountType.Administrator, student))
                    .thenThrow(new InsufficientPermissionException());

            patchType(STUDENT_TOKEN, targetId.toString(), body("Administrator"))
                    .andExpect(status().isForbidden());
        }

        @Test
        void updateType_withMissingAccount_returns404() throws Exception {
            when(accountService.updateType(targetId, AccountType.Student, administrator))
                    .thenThrow(new InvalidAccountException());

            patchType(ADMIN_TOKEN, targetId.toString(), body("Student"))
                    .andExpect(status().isNotFound());
        }

        @Test
        void updateType_demotingLastAdministrator_returns409() throws Exception {
            when(accountService.updateType(targetId, AccountType.Student, administrator))
                    .thenThrow(new LastAdministratorException());

            patchType(ADMIN_TOKEN, targetId.toString(), body("Student"))
                    .andExpect(status().isConflict());
        }
    }

    @Nested
    @DisplayName("Only PATCH is allowed, and requests shall be authenticated")
    class MethodAndAuthenticationTests {

        @ParameterizedTest
        @ValueSource(strings = {"GET", "POST", "PUT", "DELETE"})
        void accounts_withOtherMethods_returns405(String method) throws Exception {
            mockMvc.perform(request(HttpMethod.valueOf(method), "/api/v1/accounts/{id}", targetId)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ADMIN_TOKEN)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body("Student")))
                    .andExpect(status().isMethodNotAllowed());

            verifyNoInteractions(accountService);
        }

        @Test
        void updateType_withoutAccessToken_returns401() throws Exception {
            mockMvc.perform(patch("/api/v1/accounts/{id}", targetId)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body("Student")))
                    .andExpect(status().isUnauthorized());

            verifyNoInteractions(accountService);
        }

        @Test
        void updateType_withInvalidAccessToken_returns401() throws Exception {
            when(jwtService.parseAndValidate("bad-token")).thenThrow(new InvalidAccessTokenException());

            patchType("bad-token", targetId.toString(), body("Student"))
                    .andExpect(status().isUnauthorized());

            verifyNoInteractions(accountService);
        }
    }

    @Nested
    @DisplayName("Edit Account Email: PATCH /api/v1/accounts/{accountId}/email")
    class UpdateEmailTests {

        private static final String NEW_EMAIL = "bob.lee@u.nus.edu";
        private final UUID ownId = student.accountId();

        @ParameterizedTest
        @ValueSource(strings = {
                "bob.lee@u.nus.edu",
                "bob@nus.edu.sg",
                "bob@comp.nus.edu.sg",
                "bob@yale-nus.edu.sg",
                "bob@duke-nus.edu.sg",
                "Bob.Lee@u.nus.edu"
        })
        void updateEmail_withNusEmail_returns200WithTheEmail(String email) throws Exception {
            when(accountService.updateEmail(ownId, email, student)).thenReturn(new EmailResponse(email));

            patchEmail(STUDENT_TOKEN, ownId.toString(), emailBody(email))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.email").value(email))
                    .andExpect(jsonPath("$.type").doesNotExist());

            verify(accountService).updateEmail(ownId, email, student);
        }

        @Test
        void updateEmail_withExtraFields_ignoresThemAndReturns200() throws Exception {
            when(accountService.updateEmail(ownId, NEW_EMAIL, student)).thenReturn(new EmailResponse(NEW_EMAIL));

            patchEmail(STUDENT_TOKEN, ownId.toString(), """
                    {"email":"bob.lee@u.nus.edu","type":"Administrator"}
                    """)
                    .andExpect(status().isOk());

            verify(accountService).updateEmail(ownId, NEW_EMAIL, student);
            verify(accountService, never()).updateType(any(), any(), any());
        }

        @ParameterizedTest
        @ValueSource(strings = {
                "bob@gmail.com",
                "bob@u.nus.edu.evil.com",
                "bob@fakenus.edu",
                "bob@nus.com",
                "bob@U.NUS.EDU",    // domain match is case-sensitive, as at registration
                "not-an-email",
                "@u.nus.edu",
                "",
                "   "
        })
        void updateEmail_withInvalidOrNonNusEmail_returns400(String email) throws Exception {
            patchEmail(STUDENT_TOKEN, ownId.toString(), emailBody(email))
                    .andExpect(status().isBadRequest());

            verifyNoInteractions(accountService);
        }

        @ParameterizedTest
        @ValueSource(strings = {"{}", "{\"email\":null}", "{\"mail\":\"bob@u.nus.edu\"}", "", "{\"email\":", "{\"email\":[\"bob@u.nus.edu\"]}"})
        void updateEmail_withMissingOrUnreadableEmail_returns400(String content) throws Exception {
            patchEmail(STUDENT_TOKEN, ownId.toString(), content)
                    .andExpect(status().isBadRequest());

            verifyNoInteractions(accountService);
        }

        @Test
        void updateEmail_withMalformedAccountId_returns400() throws Exception {
            patchEmail(STUDENT_TOKEN, "not-a-uuid", emailBody(NEW_EMAIL))
                    .andExpect(status().isBadRequest());

            verifyNoInteractions(accountService);
        }

        @Test
        void updateEmail_asNonOwner_returns403() throws Exception {
            when(accountService.updateEmail(targetId, NEW_EMAIL, student))
                    .thenThrow(new InsufficientPermissionException());

            patchEmail(STUDENT_TOKEN, targetId.toString(), emailBody(NEW_EMAIL))
                    .andExpect(status().isForbidden());
        }

        @Test
        void updateEmail_withMissingAccount_returns404() throws Exception {
            when(accountService.updateEmail(ownId, NEW_EMAIL, student)).thenThrow(new InvalidAccountException());

            patchEmail(STUDENT_TOKEN, ownId.toString(), emailBody(NEW_EMAIL))
                    .andExpect(status().isNotFound());
        }

        @Test
        void updateEmail_toAnEmailAlreadyInUse_returns409() throws Exception {
            when(accountService.updateEmail(ownId, NEW_EMAIL, student))
                    .thenThrow(new EmailAlreadyRegisteredException());

            patchEmail(STUDENT_TOKEN, ownId.toString(), emailBody(NEW_EMAIL))
                    .andExpect(status().isConflict());
        }

        @Test
        void updateEmail_withoutAccessToken_returns401() throws Exception {
            mockMvc.perform(patch("/api/v1/accounts/{id}/email", ownId)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(emailBody(NEW_EMAIL)))
                    .andExpect(status().isUnauthorized());

            verifyNoInteractions(accountService);
        }

        @Test
        void updateEmail_withInvalidAccessToken_returns401() throws Exception {
            when(jwtService.parseAndValidate("bad-token")).thenThrow(new InvalidAccessTokenException());

            patchEmail("bad-token", ownId.toString(), emailBody(NEW_EMAIL))
                    .andExpect(status().isUnauthorized());

            verifyNoInteractions(accountService);
        }

        @ParameterizedTest
        @ValueSource(strings = {"GET", "POST", "PUT", "DELETE"})
        void email_withOtherMethods_returns405(String method) throws Exception {
            mockMvc.perform(request(HttpMethod.valueOf(method), "/api/v1/accounts/{id}/email", ownId)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + STUDENT_TOKEN)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(emailBody(NEW_EMAIL)))
                    .andExpect(status().isMethodNotAllowed());

            verifyNoInteractions(accountService);
        }
    }

    @Nested
    @DisplayName("List Accounts: GET /api/v1/accounts")
    class ListAccountsTests {

        private final AccountPageResponse onePage = new AccountPageResponse(
                List.of(new AccountSummaryResponse(targetId, VALID_EMAIL, "Alice Tan", AccountType.Student)),
                new AccountPageResponse.PageInfo(0, 20, 1, 1, false, false));

        @Test
        void listAccounts_withoutParameters_usesDefaultsAndReturnsThePage() throws Exception {
            when(accountService.listAccounts(null, null, 0, 20, administrator)).thenReturn(onePage);

            mockMvc.perform(get("/api/v1/accounts").header(HttpHeaders.AUTHORIZATION, "Bearer " + ADMIN_TOKEN))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items[0].id").value(targetId.toString()))
                    .andExpect(jsonPath("$.items[0].email").value(VALID_EMAIL))
                    .andExpect(jsonPath("$.items[0].name").value("Alice Tan"))
                    .andExpect(jsonPath("$.items[0].type").value("Student"))
                    .andExpect(jsonPath("$.page.totalElements").value(1))
                    .andExpect(jsonPath("$.page.hasNext").value(false));
        }

        @ParameterizedTest
        @CsvSource({"Student, Student", "student, Student", "Administrator, Administrator", "administrator, Administrator"})
        void listAccounts_withFilters_passesThemToTheService(String value, AccountType expected) throws Exception {
            when(accountService.listAccounts("alice", expected, 2, 10, administrator)).thenReturn(onePage);

            mockMvc.perform(get("/api/v1/accounts")
                            .param("search", "alice").param("type", value).param("page", "2").param("size", "10")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ADMIN_TOKEN))
                    .andExpect(status().isOk());

            verify(accountService).listAccounts("alice", expected, 2, 10, administrator);
        }

        @ParameterizedTest
        @CsvSource({"type, Teacher", "page, -1", "size, 0", "size, 101", "page, abc"})
        void listAccounts_withInvalidParameter_returns400(String name, String value) throws Exception {
            mockMvc.perform(get("/api/v1/accounts").param(name, value)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ADMIN_TOKEN))
                    .andExpect(status().isBadRequest());

            verifyNoInteractions(accountService);
        }

        @Test
        void listAccounts_withOverlongSearch_returns400() throws Exception {
            mockMvc.perform(get("/api/v1/accounts").param("search", "a".repeat(101))
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ADMIN_TOKEN))
                    .andExpect(status().isBadRequest());

            verifyNoInteractions(accountService);
        }

        @Test
        void listAccounts_asStudent_returns403() throws Exception {
            when(accountService.listAccounts(null, null, 0, 20, student))
                    .thenThrow(new InsufficientPermissionException());

            mockMvc.perform(get("/api/v1/accounts").header(HttpHeaders.AUTHORIZATION, "Bearer " + STUDENT_TOKEN))
                    .andExpect(status().isForbidden());
        }

        @Test
        void listAccounts_withoutAccessToken_returns401() throws Exception {
            mockMvc.perform(get("/api/v1/accounts"))
                    .andExpect(status().isUnauthorized());

            verifyNoInteractions(accountService);
        }
    }

    // ---- Helpers ----
    private static String emailBody(String email) {
        return String.format("""
                {"email":"%s"}
                """, email);
    }

    private ResultActions patchEmail(String token, String accountId, String content) throws Exception {
        return mockMvc.perform(patch("/api/v1/accounts/" + accountId + "/email")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(content));
    }

    private static String body(String type) {
        return String.format("""
                {"type":"%s"}
                """, type);
    }

    private ResultActions patchType(String token, String accountId, String content) throws Exception {
        return mockMvc.perform(patch("/api/v1/accounts/" + accountId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(content));
    }

}
