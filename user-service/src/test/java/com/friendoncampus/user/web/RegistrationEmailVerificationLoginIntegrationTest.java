package com.friendoncampus.user.web;

import static org.assertj.core.api.Assertions.assertThat;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.repository.UserRepository;
import com.friendoncampus.user.messaging.UserOutboxRepository;
import com.friendoncampus.user.service.EmailVerificationMailer;
import com.friendoncampus.user.service.PasswordResetMailer;
import com.friendoncampus.user.support.JwtTestProperties;

@SpringBootTest(
        webEnvironment = WebEnvironment.MOCK,
        properties = {
                "spring.datasource.url=jdbc:h2:mem:registration-login;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
                "spring.datasource.driver-class-name=org.h2.Driver",
                "spring.datasource.username=sa",
                "spring.datasource.password="
        })
@AutoConfigureMockMvc
class RegistrationEmailVerificationLoginIntegrationTest {
    @Autowired
    private MockMvc mvc;

    @Test
    void healthEndpointReportsReadyAfterApplicationAndMigrationsStart() throws Exception {
        mvc.perform(get("/actuator/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }

    @Autowired
    private UserRepository users;

    @Autowired
    private UserOutboxRepository outbox;

    @MockitoBean
    private EmailVerificationMailer emailVerificationMailer;

    @MockitoBean
    private PasswordResetMailer passwordResetMailer;

    @DynamicPropertySource
    static void jwtProperties(DynamicPropertyRegistry registry) {
        JwtTestProperties.register(registry);
    }

    @Test
    void registrationCannotLoginUntilItsEmailVerificationCodeIsConfirmed() throws Exception {
        String email = "verification-flow@u.nus.edu";
        String password = "password-with-at-least-15-chars";

        mvc.perform(post("/api/users/registrations")
                        .contentType("application/json")
                        .content("{\"email\":\"" + email + "\",\"username\":\"Verification Flow\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("UNVERIFIED"));

        mvc.perform(post("/api/users/login")
                        .contentType("application/json")
                        .content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("EMAIL_VERIFICATION_REQUIRED"));

        ArgumentCaptor<String> code = ArgumentCaptor.forClass(String.class);
        verify(emailVerificationMailer).sendVerificationCode(eq(email), code.capture());

        mvc.perform(post("/api/users/email-verifications")
                        .contentType("application/json")
                        .content("{\"email\":\"" + email + "\",\"code\":\"" + code.getValue() + "\"}"))
                .andExpect(status().isNoContent());

        var activatedUser = users.findByEmail(email).orElseThrow();
        assertThat(outbox.findAll().stream().filter(event -> event.getUserId().equals(activatedUser.getId())).count())
                .isEqualTo(1);

        mvc.perform(post("/api/users/login")
                        .contentType("application/json")
                        .content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty());
    }

    @Test
    void emailVerificationCodeIsExhaustedAfterFiveRejectedAttempts() throws Exception {
        String email = "email-attempt-limit@u.nus.edu";
        String password = "password-with-at-least-15-chars";

        mvc.perform(post("/api/users/registrations")
                        .contentType("application/json")
                        .content("{\"email\":\"" + email + "\",\"username\":\"Email Attempt Limit\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isCreated());

        ArgumentCaptor<String> code = ArgumentCaptor.forClass(String.class);
        verify(emailVerificationMailer).sendVerificationCode(eq(email), code.capture());
        String incorrectCode = code.getValue().equals("000000") ? "000001" : "000000";
        for (int attempt = 0; attempt < 5; attempt++) {
            mvc.perform(post("/api/users/email-verifications")
                            .contentType("application/json")
                            .content("{\"email\":\"" + email + "\",\"code\":\"" + incorrectCode + "\"}"))
                    .andExpect(status().isBadRequest());
        }

        mvc.perform(post("/api/users/email-verifications")
                        .contentType("application/json")
                        .content("{\"email\":\"" + email + "\",\"code\":\"" + code.getValue() + "\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void passwordResetCodeIsExhaustedAfterFiveRejectedAttempts() throws Exception {
        String email = "reset-attempt-limit@u.nus.edu";
        User user = User.register(email, "Reset Attempt Limit", "reset attempt limit", "hash");
        user.activate();
        users.save(user);

        mvc.perform(post("/api/users/password-reset-requests")
                        .contentType("application/json")
                        .content("{\"email\":\"" + email + "\"}"))
                .andExpect(status().isAccepted());

        ArgumentCaptor<String> code = ArgumentCaptor.forClass(String.class);
        verify(passwordResetMailer).sendPasswordResetCode(eq(email), code.capture());
        String incorrectCode = code.getValue().equals("000000") ? "000001" : "000000";
        for (int attempt = 0; attempt < 5; attempt++) {
            mvc.perform(post("/api/users/password-reset-verifications")
                            .contentType("application/json")
                            .content("{\"email\":\"" + email + "\",\"code\":\"" + incorrectCode + "\"}"))
                    .andExpect(status().isBadRequest());
        }

        mvc.perform(post("/api/users/password-reset-verifications")
                        .contentType("application/json")
                        .content("{\"email\":\"" + email + "\",\"code\":\"" + code.getValue() + "\"}"))
                .andExpect(status().isBadRequest());
    }
}
