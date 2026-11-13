package com.friendoncampus.user.web;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.friendoncampus.user.service.InvalidPasswordResetCodeException;
import com.friendoncampus.user.service.PasswordReuseException;
import com.friendoncampus.user.service.PasswordResetService;

@WebMvcTest(PasswordResetController.class)
@AutoConfigureMockMvc(addFilters = false)
class PasswordResetControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean PasswordResetService passwordResets;

    @Test
    void returnsTheSameAcceptedResponseForKnownAndUnknownEmailRequests() throws Exception {
        String known = "{\"email\":\"alice@u.nus.edu\"}";
        String unknown = "{\"email\":\"missing@u.nus.edu\"}";

        when(passwordResets.request(anyString())).thenReturn(new PasswordResetService.PasswordResetRequestResult(90));

        mvc.perform(post("/api/users/password-reset-requests").contentType("application/json").content(known))
                .andExpect(status().isAccepted())
                .andExpect(header().string("Retry-After", "90"));
        mvc.perform(post("/api/users/password-reset-requests").contentType("application/json").content(unknown))
                .andExpect(status().isAccepted())
                .andExpect(header().string("Retry-After", "90"));
        verify(passwordResets).request("alice@u.nus.edu");
        verify(passwordResets).request("missing@u.nus.edu");
    }

    @Test
    void validatesConfirmationInputAndChangesPasswordForAValidCode() throws Exception {
        mvc.perform(post("/api/users/password-reset-confirmations").contentType("application/json")
                        .content("{\"email\":\"alice@u.nus.edu\",\"code\":\"123456\",\"password\":\"new-password-123\"}"))
                .andExpect(status().isNoContent());
        verify(passwordResets).confirm("alice@u.nus.edu", "123456", "new-password-123");

        mvc.perform(post("/api/users/password-reset-confirmations").contentType("application/json")
                        .content("{\"email\":\"alice@u.nus.edu\",\"code\":\"abcdef\",\"password\":\"short\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void rejectsNonNusEmailsForEveryPasswordResetStep() throws Exception {
        mvc.perform(post("/api/users/password-reset-requests").contentType("application/json")
                        .content("{\"email\":\"alice@example.com\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/users/password-reset-verifications").contentType("application/json")
                        .content("{\"email\":\"alice@example.com\",\"code\":\"123456\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/users/password-reset-confirmations").contentType("application/json")
                        .content("{\"email\":\"alice@example.com\",\"code\":\"123456\",\"password\":\"new-password-123\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void validatesAResetCodeBeforeThePasswordIsSubmitted() throws Exception {
        mvc.perform(post("/api/users/password-reset-verifications").contentType("application/json")
                        .content("{\"email\":\"alice@u.nus.edu\",\"code\":\"123456\"}"))
                .andExpect(status().isNoContent());
        verify(passwordResets).verify("alice@u.nus.edu", "123456");

        mvc.perform(post("/api/users/password-reset-verifications").contentType("application/json")
                        .content("{\"email\":\"alice@u.nus.edu\",\"code\":\"abcdef\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void returnsOneGenericErrorForInvalidOrExpiredCodes() throws Exception {
        doThrow(new InvalidPasswordResetCodeException()).when(passwordResets)
                .confirm(anyString(), anyString(), anyString());

        mvc.perform(post("/api/users/password-reset-confirmations").contentType("application/json")
                        .content("{\"email\":\"alice@u.nus.edu\",\"code\":\"123456\",\"password\":\"new-password-123\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Password reset failed"))
                .andExpect(jsonPath("$.detail").value("Invalid or expired password reset code"));

        doThrow(new InvalidPasswordResetCodeException()).when(passwordResets).verify(anyString(), anyString());
        mvc.perform(post("/api/users/password-reset-verifications").contentType("application/json")
                        .content("{\"email\":\"alice@u.nus.edu\",\"code\":\"123456\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Invalid or expired password reset code"));
    }

    @Test
    void explainsThatTheReplacementPasswordMustDifferAfterAValidResetCode() throws Exception {
        doThrow(new PasswordReuseException()).when(passwordResets)
                .confirm(anyString(), anyString(), anyString());

        mvc.perform(post("/api/users/password-reset-confirmations").contentType("application/json")
                        .content("{\"email\":\"alice@u.nus.edu\",\"code\":\"123456\",\"password\":\"old-password-with-15-chars\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("New password must be different from your current password"))
                .andExpect(jsonPath("$.code").value("PASSWORD_REUSE"));
    }
}
