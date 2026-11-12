/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-11-10
 * Scope (AI-28): Generated the account list endpoint, admin users page and their tests.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.account;

import com.campuscouriers.user.entity.Account;
import com.campuscouriers.user.entity.AccountType;
import com.campuscouriers.user.entity.Profile;
import com.campuscouriers.user.repository.AccountRepository;
import com.campuscouriers.user.repository.ProfileRepository;
import com.campuscouriers.user.security.access.JwtService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// GET /api/v1/accounts against real PostgreSQL, to check the search query itself (joins, LIKE escaping, paging)
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Testcontainers
class AccountListIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void configureProps(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }

    @Autowired private MockMvc mockMvc;
    @Autowired private AccountRepository accountRepository;
    @Autowired private ProfileRepository profileRepository;
    @Autowired private JwtService jwtService;

    private String adminToken;
    private String studentToken;

    @BeforeEach
    void createAccounts() {
        Account admin = create(AccountType.Administrator, "admin@u.nus.edu", "Ada Admin");
        Account alice = create(AccountType.Student, "alice@u.nus.edu", "Alice Tan");
        create(AccountType.Student, "bob@u.nus.edu", "Bob 100% Lim");
        create(AccountType.Student, "carol_x@u.nus.edu", "Carol Ng");
        accountRepository.save(new Account(AccountType.Student, "noprofile@u.nus.edu", "hash"));

        adminToken = jwtService.generateAccessToken(admin);
        studentToken = jwtService.generateAccessToken(alice);
    }

    @AfterEach
    void cleanUp() {
        profileRepository.deleteAll();
        accountRepository.deleteAll();
    }

    @Test
    void listsEveryAccountSortedByEmail_includingOnesWithoutAProfile() throws Exception {
        list(adminToken)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].email").value(contains(
                        "admin@u.nus.edu", "alice@u.nus.edu", "bob@u.nus.edu", "carol_x@u.nus.edu", "noprofile@u.nus.edu")))
                .andExpect(jsonPath("$.items[4].name").doesNotExist())
                .andExpect(jsonPath("$.page.totalElements").value(5));
    }

    @Test
    void searchMatchesNameOrEmail_ignoringCase() throws Exception {
        list(adminToken, "search", "TAN").andExpect(jsonPath("$.items[*].email").value(contains("alice@u.nus.edu")));
        list(adminToken, "search", "carol_x@").andExpect(jsonPath("$.items[*].name").value(contains("Carol Ng")));
    }

    @Test
    void wildcardsInTheSearchAreLiteral() throws Exception {
        list(adminToken, "search", "%").andExpect(jsonPath("$.items[*].email").value(contains("bob@u.nus.edu")));
        list(adminToken, "search", "_").andExpect(jsonPath("$.items[*].email").value(contains("carol_x@u.nus.edu")));
    }

    @Test
    void typeFilterAndPaging() throws Exception {
        list(adminToken, "type", "administrator")
                .andExpect(jsonPath("$.items[*].email").value(contains("admin@u.nus.edu")));
        list(adminToken, "type", "Student", "page", "1", "size", "2")
                .andExpect(jsonPath("$.items[*].email").value(contains("carol_x@u.nus.edu", "noprofile@u.nus.edu")))
                .andExpect(jsonPath("$.page.number").value(1))
                .andExpect(jsonPath("$.page.totalElements").value(4))
                .andExpect(jsonPath("$.page.totalPages").value(2))
                .andExpect(jsonPath("$.page.hasNext").value(false))
                .andExpect(jsonPath("$.page.hasPrevious").value(true));
    }

    @Test
    void studentsAreForbidden() throws Exception {
        list(studentToken).andExpect(status().isForbidden());
    }

    private Account create(AccountType type, String email, String name) {
        Account account = accountRepository.save(new Account(type, email, "hash"));
        profileRepository.save(new Profile(account, name));
        return account;
    }

    // params: name, value, name, value, ...
    private ResultActions list(String token, String... params) throws Exception {
        MockHttpServletRequestBuilder request = get("/api/v1/accounts").header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        for (int i = 0; i < params.length; i += 2) {
            request.param(params[i], params[i + 1]);
        }
        return mockMvc.perform(request);
    }

}
