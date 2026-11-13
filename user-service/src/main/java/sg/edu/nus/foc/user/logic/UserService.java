package sg.edu.nus.foc.user.logic;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.transaction.annotation.Transactional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import sg.edu.nus.foc.user.model.AccountStatus;
import sg.edu.nus.foc.user.model.OutboxEvent;
import sg.edu.nus.foc.user.model.User;
import sg.edu.nus.foc.user.repository.OutboxEventRepository;
import sg.edu.nus.foc.user.repository.UserRepository;
import sg.edu.nus.foc.user.validation.NusEmailValidator;
import sg.edu.nus.foc.user.authentication.FirebaseAuthService;
import sg.edu.nus.foc.user.event.UserCreatedEvent;


@Service
public class UserService {
    @Value("${admin.bootstrap-email:}")
    private String bootstrapAdminEmail;

    private final FirebaseAuthService firebaseAuthService;
    private final UserRepository userRepository;
    private final OrderServiceClient orderServiceClient;
    private final OutboxEventRepository outboxEventRepository;
    private final JsonMapper objectMapper;
    private final UserLifecycleStore lifecycle;

    private static final int MAX_PENALTY = 10;

    public UserService(UserRepository userRepository,
            FirebaseAuthService firebaseAuthService,
            OrderServiceClient orderServiceClient,
            OutboxEventRepository outboxEventRepository,
            JsonMapper objectMapper,
            UserLifecycleStore lifecycle) {
        this.userRepository = userRepository;
        this.firebaseAuthService = firebaseAuthService;
        this.orderServiceClient = orderServiceClient;
        this.outboxEventRepository = outboxEventRepository;
        this.objectMapper = objectMapper;
        this.lifecycle = lifecycle;
    }

    public List<User> fetchAllUsers() {
        // Refreshes all users 
        lifecycle.clearAllExpiredSuspensions(Instant.now());

        return userRepository.findAll();
    }

    public User getUserByUserId(String userId) {
        // Refresh to ensure status is up to date
        lifecycle.clearExpiredSuspension(userId, Instant.now());

        return userRepository
                .findByUserId(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "User not found"
                ));

    }

    public UserRoleContext getRoleContext(String userId) {
        // Refresh to ensure status is up to date
        lifecycle.clearExpiredSuspension(userId, Instant.now());

        User user = userRepository
                .findByUserId(userId)
                .orElseThrow(() ->
                        new RuntimeException("User not found"));

        String userIdToSend = user.getUserId();
        List<String> rolesToSend;
        boolean isCourierSuspended;
        if (verifyActive(user)) {
            rolesToSend = user.getRoles() != null
                    ? user.getRoles()
                    : List.of();
            isCourierSuspended = user.getIsCourierSuspended();
        } else {
            // Hide user info if they are deactivated
            rolesToSend = List.of();
            isCourierSuspended = false;
        }

        return new UserRoleContext(userIdToSend, rolesToSend, isCourierSuspended);
    }

    public CourierEligibility getCourierEligibility(String userId) {
        Instant now = Instant.now();
        lifecycle.clearExpiredSuspension(userId, now);

        User user = userRepository
                .findByUserId(userId)
                .orElseThrow(() ->
                        new RuntimeException("User not found"));

        return new CourierEligibility(verifyCourier(user) &&
                !(user.getPenalty() >= 10
                && user.getSuspensionEndDate() != null
                && user.getSuspensionEndDate().isAfter(now))
            );
    }

    public RequesterEligibility getRequesterEligibility(String userId) {
        lifecycle.clearExpiredSuspension(userId, Instant.now());

        User user = userRepository
                .findByUserId(userId)
                .orElseThrow(() ->
                        new RuntimeException("User not found"));

        return new RequesterEligibility(verifyRequester(user));
    }

    public AdminEligibility getAdminEligibility(String userId) {
        lifecycle.clearExpiredSuspension(userId, Instant.now());

        User user = userRepository
                .findByUserId(userId)
                .orElseThrow(() ->
                        new RuntimeException("User not found"));

        return new AdminEligibility(verifyAdmin(user));
    }

    public UserSummary getUserSummary(String userId) {
        // Already refreshes
        User user = getUserByUserId(userId);

        return new UserSummary(
            user.getUsername(),
            user.getUserId(),
            user.getEmail(),
            user.getRoles(),
            user.getPenalty(),
            user.getIsCourierSuspended(),
            user.getSuspensionEndDate());
    }

    // Transactional so adding user and user-created event is done atomically
    @Transactional
    public User addUser(String userId, String email, String username) {
        return createUser(userId, email, List.of("courier", "requester"), username);
    }

    @Transactional
    public User addAdmin(String userId, String email) {
        return createUser(userId, email, List.of("courier", "requester", "admin"), "Admin");
    }

    public User createUser(String userId, String email, List<String> roles, String username) {
        if (userId == null || userId.isBlank()
            || email == null || email.isBlank()
            || username == null || username.isBlank()) {
            throw new IllegalArgumentException(
                "Username, user ID and email are required.");
        }

        if (!NusEmailValidator.isValid(email)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Please use your NUS email address (@u.nus.edu)."
            );
        }

        if (userRepository.findByUserId(userId).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This identity already has an account.");
        }

        Optional<User> existingUser = userRepository.findFirstByEmailAndStatus(email, AccountStatus.ACTIVE);

        if (existingUser.isPresent()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Email already registered"
            );
        }

        User user = new User();
        user.setUserId(userId);
        user.setEmail(email);
        user.setUsername(username);
        user.setRoles(roles);

        User savedUser = userRepository.save(user);

        String eventId = UUID.randomUUID().toString();

        UserCreatedEvent event = new UserCreatedEvent(
                eventId,
                savedUser.getUserId(),
                savedUser.getEmail(),
                Instant.now(),
                1
        );

        try {
            String payload = objectMapper.writeValueAsString(event);

            outboxEventRepository.save(new OutboxEvent(
                    eventId,
                    "UserCreated",
                    payload
            ));
        } catch (JacksonException  e) {
            throw new IllegalStateException(
                    "Could not serialize UserCreated event.", e);
        }

        return savedUser;
    }

    // Currently, users can only update their username
    // Password and email are handled elsewhere
    public User updateUser(String userId, UpdateUserRequest request) {
        User user = getUserByUserId(userId);

        String username = request.getUsername();

        if (username != null) {
            user.setUsername(username);
        }

        return lifecycle.saveActive(user);
    }

    // Syncs MongoDB user email with Firebase
    public User syncVerifiedEmail(String userId) {
        User user = getUserByUserId(userId);

        // Firebase is the source of truth for the verified email.
        String verifiedEmail =
                firebaseAuthService.getVerifiedEmail(userId);

        if (!NusEmailValidator.isValid(verifiedEmail)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Please use your NUS email address (@u.nus.edu)."
            );
        }

        // Update MongoDB only after Firebase verification succeeds.
        user.setEmail(verifiedEmail);

        return lifecycle.saveActive(user);
    }

    // Updates email
    public User updateUserEmail(String userId, UpdateUserRequest request) {
        User user = getUserByUserId(userId);
        String email = request.getEmail();

        if (email != null && !email.equals(user.getEmail())) {
            user.setEmail(email);
            firebaseAuthService.updateUserEmail(userId, email);
        }

        return lifecycle.saveActive(user);
    }

    public void deactivateUser(String token, String userId) {
        // Refresh to ensure status is up to date
        lifecycle.clearExpiredSuspension(userId, Instant.now());
        
        User user = userRepository.findByUserId(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "User not found"
                    ));

        // Already deactivated.
        if (user.getStatus() == AccountStatus.DEACTIVATED) {
            return;
        }

        // Do not start another deletion while one is in progress.
        if (user.getStatus() == AccountStatus.DEACTIVATION_PENDING) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Account deactivation is already in progress"
            );
        }

        // Checks if it is the last admin
        // Throws error if it is
        boolean isAdmin = verifyAdmin(user);
        if (isAdmin) {
            long adminCount = userRepository.countByRolesContainingAndStatus(
                        "admin",
                        AccountStatus.ACTIVE
                );

            if (adminCount <= 1) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Cannot disable the last administrator"
                );
            }
        }

        User pending = lifecycle.begin(userId);
        recoverDeletion(pending);
    }

    public void recoverDeletion(User pending) {
        try {
            if (pending.getDeletionOperationId() == null) {
                pending = lifecycle.attachLegacyOperation(pending.getUserId());
            }
            if (pending == null || pending.getStatus() != AccountStatus.DEACTIVATION_PENDING) return;
            if (!orderServiceClient.prepareDeletion(pending.getUserId(), pending.getDeletionOperationId())) {
                // Only an authoritative, durable denial permits reversing a new deletion attempt.
                lifecycle.restoreAfterDenial(pending);
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Cannot disable user with active orders or unresolved requests.");
            }
            if (!lifecycle.seal(pending)) return;
            firebaseAuthService.deleteUserIfExists(pending.getUserId());
            lifecycle.complete(pending);
        } catch (ResponseStatusException expected) {
            throw expected;
        } catch (RuntimeException e) {
            // Leave the account pending if the Firebase deletion outcome is uncertain.
            // A recovery process can reconcile the state.
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Account deletion could not be confirmed. Please try again later.",
                    e
            );
        }
    }

    // Adds admin role to user
    // Doesn't change role list if already admin
    public User promoteUser(String userId) {
        // Refresh to ensure status is up to date
        lifecycle.clearExpiredSuspension(userId, Instant.now());

        User user = userRepository
                .findByUserId(userId)
                .orElseThrow(() ->
                        new RuntimeException("User not found"));

        List<String> roles = user.getRoles();
        if (!roles.contains("admin")) {
            List<String> updatedRoles = new ArrayList<>(user.getRoles());
            updatedRoles.add("admin");
            user.setRoles(updatedRoles);
        }

        return lifecycle.saveActive(user);
    }

    // Removes admin role from user
    // Doesn't change role list if already not admin
    public User demoteUser(String userId) {
        // Refresh to ensure status is up to date
        lifecycle.clearExpiredSuspension(userId, Instant.now());

        User user = userRepository
                .findByUserId(userId)
                .orElseThrow(() ->
                        new RuntimeException("User not found"));

        // Checks if it is the last admin
        // Throws error if it is
        boolean isAdmin = verifyAdmin(user);
        if (isAdmin) {
            long adminCount = userRepository.countByRolesContainingAndStatus(
                        "admin",
                        AccountStatus.ACTIVE
                );

            if (adminCount <= 1) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Cannot disable the last administrator"
                );
            }

            List<String> updatedRoles = new ArrayList<>(user.getRoles());
            updatedRoles.remove("admin");
            user.setRoles(updatedRoles);
        }

        return lifecycle.saveActive(user);
    }

    // Single method to update a user's penalty
    // Accepts negative and positive penalty.
    public User adjustPenalty(String userId, int penaltyChange) {
        // Already refreshes suspension
        User user = getUserByUserId(userId);
        Instant now = Instant.now();

        // Permanently suspended couriers cannot receive further adjustments.
        if (user.getIsPermanentlySuspended()) {
            return user;
        }

        // Temporary suspension: lock the penalty until expiry.
        if (user.getIsCourierSuspended()) {
            if (user.getSuspensionEndDate() != null
                    && now.isBefore(user.getSuspensionEndDate())) {
                return user;
            }

            // Suspension has expired.
            user.setIsCourierSuspended(false);
            user.setSuspensionEndDate(null);
        }

        int newPenalty = Math.max(
            0,
            Math.min(MAX_PENALTY, user.getPenalty() + penaltyChange)
        );

        user.setPenalty(newPenalty);

        if (newPenalty >= MAX_PENALTY) {
            user.setIsCourierSuspended(true);
            user.setSuspensionEndDate(createSuspensionEndDate(1));
        }

        return lifecycle.saveActive(user);
    }

    // Single method to suspend a user
    // Can suspend admin because suspended admins still can carry out admin actions
    // Just not courier actions
    // Sets penalty to MAX_PENALTY
    // If a user is already suspended, this will extend suspension to 1 month from now
    public User suspendUser(String userId) {
        User user = getUserByUserId(userId);

        user.setPenalty(MAX_PENALTY);

        user.setIsCourierSuspended(true);
        user.setSuspensionEndDate(createSuspensionEndDate(1));

        return lifecycle.saveActive(user);
    }

    // Single method to premanently suspend a user
    // Can suspend admin because suspended admins still can carry out admin actions
    // Just not courier actions
    // Sets penalty to MAX_PENALTY
    public User suspendUserPermanently(String userId) {
        User user = getUserByUserId(userId);

        user.setPenalty(MAX_PENALTY);

        user.setIsCourierSuspended(true);
        user.setIsPermanentlySuspended(true);

        return lifecycle.saveActive(user);
    }

    // Single method to unsuspend a user
    public User unsuspendUser(String userId) {
        User user = getUserByUserId(userId);

        if (!user.getIsCourierSuspended() || !verifyActive(user)) {
            // Do not unsuspend already unsuspended users, or inactive users
            return user;
        }

        user.setIsCourierSuspended(false);
        user.setSuspensionEndDate(null);

        return lifecycle.saveActive(user);
    }


    // Helper functions
    public boolean verifyAdmin(User user) {
        List<String> roles = user.getRoles();
        return user.getStatus() == AccountStatus.ACTIVE && roles != null && roles.contains("admin");
    }

    public boolean verifyAdmin(String userId) {
        User user = userRepository
                .findByUserId(userId)
                .orElseThrow(() ->
                        new RuntimeException("User not found"));

        List<String> roles = user.getRoles();
        return user.getStatus() == AccountStatus.ACTIVE && roles != null && roles.contains("admin");
    }

    public boolean verifyRequester(User user) {
        List<String> roles = user.getRoles();
        return user.getStatus() == AccountStatus.ACTIVE && roles != null && roles.contains("requester");
    }

    public boolean verifyRequester(String userId) {
        User user = userRepository
                .findByUserId(userId)
                .orElseThrow(() ->
                        new RuntimeException("User not found"));

        List<String> roles = user.getRoles();
        return user.getStatus() == AccountStatus.ACTIVE && roles != null && roles.contains("requester");
    }

    public boolean verifyCourier(User user) {
        List<String> roles = user.getRoles();
        return user.getStatus() == AccountStatus.ACTIVE && roles != null && roles.contains("courier");
    }

    public boolean verifyCourier(String userId) {
        User user = userRepository
                .findByUserId(userId)
                .orElseThrow(() ->
                        new RuntimeException("User not found"));

        List<String> roles = user.getRoles();
        return user.getStatus() == AccountStatus.ACTIVE && roles != null && roles.contains("courier");
    }

    private Instant createSuspensionEndDate(int months) {
       return ZonedDateTime.now(ZoneId.of("Asia/Singapore"))
                .plusMonths(months)
                .toInstant();
    }

    private boolean verifyActive(String userId) {
        User user = userRepository
                .findByUserId(userId)
                .orElseThrow(() ->
                        new RuntimeException("User not found"));
        return user.getStatus() == AccountStatus.ACTIVE;
    }

    private boolean verifyActive(User user) {
        return user.getStatus() == AccountStatus.ACTIVE;
    }
}
