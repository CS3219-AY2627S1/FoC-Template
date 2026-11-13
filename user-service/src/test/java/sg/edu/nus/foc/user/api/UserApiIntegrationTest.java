package sg.edu.nus.foc.user.api;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;

import org.springframework.data.mongodb.core.MongoTemplate;

import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import org.springframework.test.web.servlet.result.MockMvcResultMatchers;

import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import sg.edu.nus.foc.user.authentication.FirebaseAuthService;
import sg.edu.nus.foc.user.logic.OrderServiceClient;
import sg.edu.nus.foc.user.model.AccountStatus;
import sg.edu.nus.foc.user.model.OutboxEvent;
import sg.edu.nus.foc.user.model.User;
import sg.edu.nus.foc.user.repository.OutboxEventRepository;
import sg.edu.nus.foc.user.repository.UserRepository;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.reset;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
        "firebase.auth.project-id=demo-foc",
        "firebase.auth.emulator-host=localhost:9099",

        "FOC_ENVIRONMENT=local",
        "USER_PUBSUB_PUSH_MODE=emulator",
        "PUBSUB_EMULATOR_HOST=localhost:8085",

        "order-service.url=http://localhost:8082"
})
@AutoConfigureMockMvc
@Testcontainers
class UserApiIntegrationTest {

    @Container
    static final MongoDBContainer mongo =
            new MongoDBContainer("mongo:7.0");

    @DynamicPropertySource
    static void mongoProperties(DynamicPropertyRegistry registry) {
        String mongoUri = mongo.getReplicaSetUrl();

        // Set both property names to accommodate the MongoDB
        // configuration property used by the application.
        registry.add("spring.mongodb.uri", () -> mongoUri);
        registry.add("spring.data.mongodb.uri", () -> mongoUri);
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private MongoTemplate mongoTemplate;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private OutboxEventRepository outboxEventRepository;

    // External dependencies: do not call Firebase or Order Service
    // during these integration tests.
    @MockitoBean
    private FirebaseAuthService firebaseAuthService;

    @MockitoBean
    private OrderServiceClient orderServiceClient;

    @BeforeEach
    void setUp() {
        // Delete documents without dropping collections or indexes.
        outboxEventRepository.deleteAll();
        userRepository.deleteAll();

        reset(firebaseAuthService, orderServiceClient);
    }

    // ---------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------

    private User createUser(
            String userId,
            String email,
            String username,
            List<String> roles,
            AccountStatus status
    ) {
        User user = new User();

        user.setUserId(userId);
        user.setEmail(email);
        user.setUsername(username);
        user.setRoles(roles);
        user.setStatus(status);

        return userRepository.save(user);
    }

    private RequestPostProcessor authenticatedAs(String userId) {
        return jwt()
                .jwt(token -> token
                        .subject(userId)
                        .claim("email", userId + "@u.nus.edu"));
    }

    private RequestPostProcessor authenticatedAsWithAdminClaim(
            String userId
    ) {
        return jwt()
                .jwt(token -> token
                        .subject(userId)
                        .claim("email", userId + "@u.nus.edu")
                        .claim("roles", List.of("admin")));
    }

    // ---------------------------------------------------------
    // Registration
    // ---------------------------------------------------------

    @Test
    void registerUser_savesUserAndOutboxEvent() throws Exception {
        mockMvc.perform(post("/api/users")
                        .with(authenticatedAs("firebase-user-1"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                    "username": "testuser"
                                }
                                """))
                .andExpect(status().isCreated());

        User savedUser = userRepository
                .findByUserId("firebase-user-1")
                .orElseThrow();

        assertThat(savedUser.getUserId())
                .isEqualTo("firebase-user-1");

        assertThat(savedUser.getEmail())
                .isEqualTo("firebase-user-1@u.nus.edu");

        assertThat(savedUser.getUsername())
                .isEqualTo("testuser");

        assertThat(savedUser.getRoles())
                .containsExactlyInAnyOrder("courier", "requester");

        assertThat(savedUser.getStatus())
                .isEqualTo(AccountStatus.ACTIVE);

        List<OutboxEvent> events = outboxEventRepository.findAll();

        assertThat(events).hasSize(1);
        assertThat(events.get(0).getStatus()).isEqualTo("PENDING");
    }

    @Test
    void registerUser_duplicateUserId_returnsConflict() throws Exception {
        createUser(
                "firebase-user-1",
                "firebase-user-1@u.nus.edu",
                "existing",
                List.of("requester"),
                AccountStatus.ACTIVE
        );

        mockMvc.perform(post("/api/users")
                        .with(authenticatedAs("firebase-user-1"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                    "username": "another-user"
                                }
                                """))
                .andExpect(status().isConflict());

        assertThat(userRepository.findAll()).hasSize(1);
        assertThat(outboxEventRepository.findAll()).isEmpty();
    }

    // ---------------------------------------------------------
    // User profile
    // ---------------------------------------------------------

    @Test
    void getCurrentUser_returnsAuthenticatedUsersProfile()
            throws Exception {

        createUser(
                "firebase-user-1",
                "user@u.nus.edu",
                "testuser",
                List.of("requester", "courier"),
                AccountStatus.ACTIVE
        );

        mockMvc.perform(get("/api/users/me")
                        .with(authenticatedAs("firebase-user-1")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId")
                        .value("firebase-user-1"))
                .andExpect(jsonPath("$.username")
                        .value("testuser"))
                .andExpect(jsonPath("$.email")
                        .value("user@u.nus.edu"));
    }

    @Test
    void updateCurrentUser_updatesUsername() throws Exception {
        createUser(
                "firebase-user-1",
                "user@u.nus.edu",
                "oldname",
                List.of("requester"),
                AccountStatus.ACTIVE
        );

        mockMvc.perform(put("/api/users/me")
                        .with(authenticatedAs("firebase-user-1"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                    "username": "newname"
                                }
                                """))
                .andExpect(status().isOk());

        User updatedUser = userRepository
                .findByUserId("firebase-user-1")
                .orElseThrow();

        assertThat(updatedUser.getUsername())
                .isEqualTo("newname");
    }

    // ---------------------------------------------------------
    // MongoDB-backed role authorisation
    // ---------------------------------------------------------

    @Test
    void getAllUsers_adminCanAccessEndpoint() throws Exception {
        createUser(
                "admin-user",
                "admin@u.nus.edu",
                "admin",
                List.of("admin", "requester"),
                AccountStatus.ACTIVE
        );

        createUser(
                "normal-user",
                "normal@u.nus.edu",
                "normal",
                List.of("requester"),
                AccountStatus.ACTIVE
        );

        mockMvc.perform(get("/api/users")
                        .with(authenticatedAs("admin-user")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());
    }

    @Test
    void getAllUsers_requesterCannotAccessEndpoint() throws Exception {
        createUser(
                "normal-user",
                "normal@u.nus.edu",
                "normal",
                List.of("requester"),
                AccountStatus.ACTIVE
        );

        mockMvc.perform(get("/api/users")
                        .with(authenticatedAs("normal-user")))
                .andExpect(status().isForbidden());
    }

    @Test
    void getAllUsers_jwtAdminClaimDoesNotGrantAdminAccess()
            throws Exception {

        createUser(
                "normal-user",
                "normal@u.nus.edu",
                "normal",
                List.of("requester"),
                AccountStatus.ACTIVE
        );

        // The JWT claims admin, but MongoDB says this user
        // only has the requester role.
        mockMvc.perform(get("/api/users")
                        .with(authenticatedAsWithAdminClaim("normal-user")))
                .andExpect(status().isForbidden());
    }

    @Test
    void getAllUsers_inactiveAdminCannotAccessEndpoint()
            throws Exception {

        createUser(
                "inactive-admin",
                "inactive@u.nus.edu",
                "inactive",
                List.of("admin"),
                AccountStatus.DEACTIVATED
        );

        mockMvc.perform(get("/api/users")
                        .with(authenticatedAs("inactive-admin")))
                .andExpect(status().isForbidden());
    }

    // ---------------------------------------------------------
    // Penalty
    // ---------------------------------------------------------

    @Test
    void adjustPenalty_updatesPenalty() throws Exception {
        createUser(
                "courier-user",
                "courier@u.nus.edu",
                "courier",
                List.of("courier"),
                AccountStatus.ACTIVE
        );

        mockMvc.perform(put("/api/users/courier-user/penalty")
                        .with(authenticatedAs("courier-user"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                    "userId": "courier-user",
                                    "penalty": 3
                                }
                                """))
                .andExpect(status().isOk());

        User updatedUser = userRepository
                .findByUserId("courier-user")
                .orElseThrow();

        assertThat(updatedUser.getPenalty()).isEqualTo(3);
    }

    @Test
    void adjustPenalty_capsPenaltyAtMaximum() throws Exception {
        createUser(
                "courier-user",
                "courier@u.nus.edu",
                "courier",
                List.of("courier"),
                AccountStatus.ACTIVE
        );

        mockMvc.perform(put("/api/users/courier-user/penalty")
                        .with(authenticatedAs("courier-user"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                    "userId": "courier-user",
                                    "penalty": 99
                                }
                                """))
                .andExpect(status().isOk());

        User updatedUser = userRepository
                .findByUserId("courier-user")
                .orElseThrow();

        assertThat(updatedUser.getPenalty()).isEqualTo(10);
        assertThat(updatedUser.getIsCourierSuspended()).isTrue();
    }
}
