package com.friendoncampus.credit.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.friendoncampus.credit.domain.CreditAccount;
import com.friendoncampus.credit.repository.CreditAccountRepository;
import com.friendoncampus.credit.repository.CreditInboxEventRepository;
import com.friendoncampus.credit.repository.CreditLedgerEntryRepository;
import com.friendoncampus.credit.repository.CreditOperationRepository;
import com.friendoncampus.credit.repository.CreditOutboxEventRepository;
import com.friendoncampus.credit.repository.CreditReservationRepository;
import com.friendoncampus.credit.repository.CreditEventStreamVersionRepository;

@SpringBootTest(properties = {
        "spring.autoconfigure.exclude="
                + "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration,"
                + "org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration,"
                + "org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration"
})
@AutoConfigureMockMvc
class CreditQuerySecurityTest {
    @MockitoBean com.friendoncampus.credit.dispute.DisputeBus disputeBus;
    @org.springframework.test.context.bean.override.mockito.MockitoBean
    com.friendoncampus.credit.authorization.CurrentAuthorization currentAuthorization;

    private static final UUID USER_ID = UUID.fromString("10000000-0000-0000-0000-000000000000");
    private static final UUID OTHER_USER_ID = UUID.fromString("20000000-0000-0000-0000-000000000000");

    @Autowired MockMvc mockMvc;
    @MockitoBean JwtDecoder jwtDecoder;
    @MockitoBean CreditAccountRepository accounts;
    @MockitoBean CreditLedgerEntryRepository ledger;
    @MockitoBean CreditOperationRepository operations;
    @MockitoBean CreditReservationRepository reservations;
    @MockitoBean CreditInboxEventRepository inbox;
    @MockitoBean CreditOutboxEventRepository outbox;
    @MockitoBean CreditEventStreamVersionRepository eventVersions;
    @MockitoBean com.friendoncampus.credit.integration.AdminCreditCorrectionService adminCorrections;
    @MockitoBean com.friendoncampus.credit.integration.AdminCreditOutbox adminOutbox;

    @MockitoBean com.friendoncampus.credit.service.DisputeSettlementService disputeSettlements;

    private CreditAccount account;

    @BeforeEach
    void setUp() {
        account = CreditAccount.empty(USER_ID);
        account.grantInitialAllocation(10);
        when(jwtDecoder.decode("user-token")).thenReturn(jwt(USER_ID));
    }

    @Test
    void rejectsBalanceQueryWithoutBearerToken() throws Exception {
        mockMvc.perform(get("/api/credits/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Unauthorized"));
    }

    @Test
    void rejectsAccountActivationWithoutBearerToken() throws Exception {
        mockMvc.perform(post("/api/credits/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Unauthorized"));
    }

    @Test
    void servesTheCreditDashboardWithoutRequiringApiAuthentication() throws Exception {
        mockMvc.perform(get("/credits"))
                .andExpect(status().isOk())
                .andExpect(forwardedUrl("/credit-assets/index.html"));
    }

    @Test
    void returnsOnlyTheJwtSubjectsBalance() throws Exception {
        when(accounts.findById(USER_ID)).thenReturn(Optional.of(account));

        mockMvc.perform(get("/api/credits/me")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer user-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(USER_ID.toString()))
                .andExpect(jsonPath("$.availableBalance").value(10))
                .andExpect(jsonPath("$.reservedBalance").value(0))
                .andExpect(jsonPath("$.totalBalance").value(10));

        verify(accounts).findById(USER_ID);
        verify(accounts, never()).findById(OTHER_USER_ID);
    }

    @Test
    void transparentlyCreatesTheJwtSubjectsAccountWithTenCredits() throws Exception {
        CreditAccount newAccount = CreditAccount.empty(USER_ID);
        when(accounts.findByUserIdForUpdate(USER_ID)).thenReturn(Optional.of(newAccount));
        when(accounts.findById(USER_ID)).thenReturn(Optional.of(newAccount));

        mockMvc.perform(post("/api/credits/me")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer user-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(USER_ID.toString()))
                .andExpect(jsonPath("$.availableBalance").value(10))
                .andExpect(jsonPath("$.reservedBalance").value(0))
                .andExpect(jsonPath("$.totalBalance").value(10));

        verify(accounts).insertEmptyIfAbsent(USER_ID);
        verify(accounts, never()).findById(OTHER_USER_ID);
    }

    @Test
    void ignoresAnAttemptToSelectAnotherAccountByQueryParameter() throws Exception {
        when(accounts.findById(USER_ID)).thenReturn(Optional.of(account));

        mockMvc.perform(get("/api/credits/me")
                        .queryParam("userId", OTHER_USER_ID.toString())
                        .header(HttpHeaders.AUTHORIZATION, "Bearer user-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(USER_ID.toString()));

        verify(accounts).findById(USER_ID);
        verify(accounts, never()).findById(OTHER_USER_ID);
    }

    @Test
    void returnsPaginatedHistoryForTheJwtSubject() throws Exception {
        when(accounts.findById(USER_ID)).thenReturn(Optional.of(account));
        when(ledger.findByAccountId(any(UUID.class), any(Pageable.class))).thenReturn(Page.empty());

        mockMvc.perform(get("/api/credits/me/transactions")
                        .queryParam("page", "0")
                        .queryParam("size", "25")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer user-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray())
                .andExpect(jsonPath("$.totalElements").value(0));

        verify(ledger).findByAccountId(org.mockito.ArgumentMatchers.eq(USER_ID), any(Pageable.class));
    }

    @Test
    void rejectsOversizedHistoryPages() throws Exception {
        mockMvc.perform(get("/api/credits/me/transactions")
                        .queryParam("size", "101")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer user-token"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Invalid credit query"));
    }

    @Test
    void directBalanceQueryStillReturnsNotFoundBeforeAutomaticActivation() throws Exception {
        when(accounts.findById(USER_ID)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/credits/me")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer user-token"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.title").value("Credit account not found"));
    }

    private static Jwt jwt(UUID subject) {
        Instant now = Instant.now();
        return new Jwt(
                "user-token",
                now.minusSeconds(10),
                now.plusSeconds(300),
                java.util.Map.of("alg", "RS256"),
                java.util.Map.of(
                        "sub", subject.toString(),
                        "role", "REQUESTER",
                        "iss", "friend-on-campus-user-service",
                        "aud", List.of("friend-on-campus-api")));
    }
}
