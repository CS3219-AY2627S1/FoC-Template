package sg.edu.nus.foc.user.config;

import com.google.auth.oauth2.AccessToken;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;


@Configuration
public class FirebaseConfig {

    public FirebaseConfig(
            @Value("${firebase.auth.project-id:demo-foc}") String projectId,
            @Value("${firebase.auth.emulator-host:}") String emulatorHost
    ) {
        if (FirebaseApp.getApps().isEmpty()) {
            FirebaseOptions.Builder builder = FirebaseOptions.builder()
                    .setProjectId(projectId);
            if (!emulatorHost.isBlank()) {
                GoogleCredentials credentials =
                        GoogleCredentials.create(
                                new AccessToken("fake-token", null)
                        );
                builder.setCredentials(credentials);
            } else {
                try {
                    builder.setCredentials(
                            GoogleCredentials.getApplicationDefault()
                    );
                } catch (Exception e) {
                    throw new RuntimeException(
                            "Could not load Firebase production credentials",
                            e
                    );
                }
            }
            FirebaseApp.initializeApp(builder.build());
        }
    }

    @Bean
    public FirebaseAuth firebaseAuth() {
        return FirebaseAuth.getInstance();
    }
}