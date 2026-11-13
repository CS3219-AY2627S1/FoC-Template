package sg.edu.nus.foc.user.config;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.UserRecord;

import sg.edu.nus.foc.user.logic.UserService;
import sg.edu.nus.foc.user.repository.UserRepository;


import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;


@Component
public class AdminBootstrap implements CommandLineRunner {
    private final UserRepository userRepository;
    private final UserService userService;
    private final FirebaseAuth firebaseAuth;

    @Value("${admin.bootstrap-enabled:false}")
    private boolean enabled;

    @Value("${admin.bootstrap-email:}")
    private String bootstrapEmail;

    public AdminBootstrap(UserRepository userRepository, UserService userService, FirebaseAuth firebaseAuth) {
        this.userRepository = userRepository;
        this.userService = userService;
        this.firebaseAuth = firebaseAuth;
    }

    // Executes on user service startup
    // Have to create Firebase account first through console
    // Then enable bootstrap and put in email in env
    // A MongoDB user is created for that email
    @Override
    public void run(String... args) {

        // Bootstrap is disabled
        if (!enabled) {
            return;
        }

        // Admin already exists
        if (userRepository.findFirstByRolesContaining("admin").isPresent()) {
            System.out.println("Admin already exists. Skipping bootstrap.");
            return;
        }

        if (bootstrapEmail == null || bootstrapEmail.isBlank()) {
            throw new IllegalStateException(
                "Admin bootstrap is enabled but no email was configured."
            );
        }

        try {
            UserRecord firebaseUser = firebaseAuth.getUserByEmail(bootstrapEmail);
            userService.addAdmin(firebaseUser.getUid(), firebaseUser.getEmail());
        } catch (FirebaseAuthException e) {
            throw new RuntimeException(
                "Could not find bootstrap admin in Firebase: "
                + bootstrapEmail,
                e
            );
        }
    }
}