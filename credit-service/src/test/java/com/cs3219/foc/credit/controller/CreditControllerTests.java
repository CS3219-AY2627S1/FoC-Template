package com.cs3219.foc.credit.controller;

import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.cs3219.foc.credit.config.SecurityConfig;
import com.cs3219.foc.credit.exception.CreditAccountPendingException;
import com.cs3219.foc.credit.exception.GlobalExceptionHandler;
import com.cs3219.foc.credit.exception.ValidationFailedException;
import com.cs3219.foc.credit.model.dto.*;
import com.cs3219.foc.credit.model.dto.CreditBalanceResponse;
import com.cs3219.foc.credit.service.CreditAccountService;
import com.cs3219.foc.credit.service.CreditReservationService;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.web.context.WebApplicationContext;

@WebMvcTest(
        value = {CreditController.class, CreditReservationController.class},
        properties = {
            "events.messaging.topic-arn=arn:aws:sns:ap-southeast-1:000000000000:foc-test-credit-events",
            "events.messaging.queue-name=foc-test-credit-events"
        })
@Import(CreditControllerTests.TestConfig.class)
class CreditControllerTests {
    @Autowired
    private WebApplicationContext context;

    @Autowired
    private CreditAccountService service;

    @Autowired
    private JwtDecoder decoder;

    @Autowired
    private CreditReservationService creditReservationService;

    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        reset(service, decoder, creditReservationService);
        mvc = MockMvcBuilders.webAppContextSetup(context)
                .apply(springSecurity())
                .build();
    }

    @Test
    void readsOnlyTheJwtOwnersBalanceEvenWithAnotherUserParameter() throws Exception {
        var owner = UUID.randomUUID();
        when(service.getBalance()).thenReturn(new CreditBalanceResponse(70, 30));
        mvc.perform(get("/credits/me")
                        .param("userId", UUID.randomUUID().toString())
                        .with(jwt().jwt(token -> token.subject(owner.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.availableBalance").value(70))
                .andExpect(jsonPath("$.reservedBalance").value(30));
        verify(service).getBalance();
        verifyNoMoreInteractions(service);
    }

    @Test
    void requiresAuthentication() throws Exception {
        mvc.perform(get("/credits/me")).andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }

    @Test
    void rejectsInvalidBearerToken() throws Exception {
        when(decoder.decode("invalid")).thenThrow(new BadJwtException("Invalid token"));
        mvc.perform(get("/credits/me").header("Authorization", "Bearer invalid"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }

    @Test
    void reportsPendingAccountWithoutInitializingIt() throws Exception {
        var owner = UUID.randomUUID();
        when(service.getBalance()).thenThrow(new CreditAccountPendingException());
        mvc.perform(get("/credits/me").with(jwt().jwt(token -> token.subject(owner.toString()))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CREDIT_ACCOUNT_PENDING"))
                .andExpect(jsonPath("$.message").value("Credit account setup is pending. Please try again later."));
        verify(service).getBalance();
        verifyNoMoreInteractions(service);
    }

    @Test
    void hasNoEndpointForSelectingAnotherAccount() throws Exception {
        mvc.perform(get("/credits/" + UUID.randomUUID())
                        .with(jwt().jwt(token -> token.subject(UUID.randomUUID().toString()))))
                .andExpect(status().isNotFound());
        verifyNoInteractions(service);
    }

    @Test
    void reservationUsesAuthenticatedAccountAndValidatesRequest() throws Exception {
        var owner = UUID.randomUUID();
        var operation = UUID.randomUUID();
        var errand = UUID.randomUUID();
        var body = "{\"operationId\":\"" + operation + "\",\"errandId\":\"" + errand + "\",\"amount\":80}";
        when(creditReservationService.reserve(any())).thenReturn(new CreditReservationResponse("RESERVED"));
        mvc.perform(post("/credits/reservations")
                        .with(jwt().jwt(t -> t.subject(owner.toString())))
                        .param("userId", UUID.randomUUID().toString())
                        .contentType("application/json")
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.outcome").value("RESERVED"));
        verify(creditReservationService).reserve(new ReserveCreditRequest(operation, errand, 80));
        mvc.perform(post("/credits/reservations")
                        .contentType("application/json")
                        .content(body))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/credits/reservations")
                        .with(jwt().jwt(t -> t.subject(owner.toString())))
                        .contentType("application/json")
                        .content(body.replace("80", "0")))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/credits/reservations")
                        .with(jwt().jwt(t -> t.subject(owner.toString())))
                        .contentType("application/json")
                        .content("{\"amount\":80}"))
                .andExpect(status().isBadRequest());
        verifyNoMoreInteractions(creditReservationService);
    }

    @ParameterizedTest
    @ValueSource(longs = {1, 80, Long.MAX_VALUE})
    void reservationAcceptsIntegerAmountsWithoutChangingThem(long amount) throws Exception {
        var owner = UUID.randomUUID();
        var request = new ReserveCreditRequest(UUID.randomUUID(), UUID.randomUUID(), amount);
        when(creditReservationService.reserve(request)).thenReturn(new CreditReservationResponse("RESERVED"));
        mvc.perform(post("/credits/reservations")
                        .with(jwt().jwt(t -> t.subject(owner.toString())))
                        .contentType("application/json")
                        .content("{\"operationId\":\"" + request.operationId() + "\",\"errandId\":\""
                                + request.errandId() + "\",\"amount\":" + amount + "}"))
                .andExpect(status().isOk());
        verify(creditReservationService).reserve(request);
    }

    @ParameterizedTest
    @ValueSource(strings = {"1.9", "1.0", "1e2", "0", "-1", "9223372036854775808", "-9223372036854775809"})
    void reservationRejectsInvalidAmountsBeforeCallingService(String amount) throws Exception {
        mvc.perform(post("/credits/reservations")
                        .with(jwt().jwt(t -> t.subject(UUID.randomUUID().toString())))
                        .contentType("application/json")
                        .content("{\"operationId\":\"" + UUID.randomUUID() + "\",\"errandId\":\"" + UUID.randomUUID()
                                + "\",\"amount\":" + amount + "}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(creditReservationService);
    }

    @Test
    void reservationReportsFieldValidationErrors() throws Exception {
        mvc.perform(post("/credits/reservations")
                        .with(jwt())
                        .contentType("application/json")
                        .content("{\"amount\":0}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.message").value("Validation failed"))
                .andExpect(jsonPath("$.fieldErrors.operationId").value("must not be null"))
                .andExpect(jsonPath("$.fieldErrors.errandId").value("must not be null"))
                .andExpect(jsonPath("$.fieldErrors.amount").value("must be greater than 0"));
        verifyNoInteractions(creditReservationService);
    }

    @Test
    void customValidationFailureReportsFieldMessages() throws Exception {
        var request = new ReserveCreditRequest(UUID.randomUUID(), UUID.randomUUID(), 80);
        var errors = new BeanPropertyBindingResult(request, "reserveCreditRequest");
        errors.rejectValue("amount", "invalid", "Invalid credit amount");
        when(creditReservationService.reserve(any()))
                .thenThrow(new ValidationFailedException("Credit validation failed", errors));

        mvc.perform(post("/credits/reservations")
                        .with(jwt())
                        .contentType("application/json")
                        .content("{\"operationId\":\"" + request.operationId() + "\",\"errandId\":\""
                                + request.errandId() + "\",\"amount\":80}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().json("""
                        {
                          "code": "VALIDATION_FAILED",
                          "message": "Credit validation failed",
                          "fieldErrors": { "amount": "Invalid credit amount" }
                        }
                        """));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "null", "{", "{\"operationId\":\"invalid-uuid\"}", "{\"amount\":1.5}"})
    void reservationReportsUnreadableRequests(String body) throws Exception {
        mvc.perform(post("/credits/reservations")
                        .with(jwt())
                        .contentType("application/json")
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
                .andExpect(jsonPath("$.message").value("Request body is missing or contains invalid fields"));
        verifyNoInteractions(creditReservationService);
    }

    @TestConfiguration
    @EnableWebSecurity
    @Import({
        SecurityConfig.class,
        CreditController.class,
        CreditReservationController.class,
        GlobalExceptionHandler.class
    })
    static class TestConfig {
        @Bean
        CreditReservationService creditReservationService() {
            return mock(CreditReservationService.class);
        }

        @Bean
        CreditAccountService creditAccountService() {
            return mock(CreditAccountService.class);
        }

        @Bean
        JwtDecoder jwtDecoder() {
            return mock(JwtDecoder.class);
        }
    }
}
