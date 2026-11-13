package sg.edu.nus.foc.user.authentication;

import com.google.firebase.auth.FirebaseToken;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AuthenticationService {

    private final FirebaseAuthService firebaseAuthService;

    public AuthenticationService(FirebaseAuthService firebaseAuthService) {
        this.firebaseAuthService = firebaseAuthService;
    }

    public FirebaseToken authenticate(String authorizationHeader) {
        if (authorizationHeader == null ||
            !authorizationHeader.startsWith("Bearer ")) {

            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Missing authentication token"
            );
        }

        String idToken = authorizationHeader.substring(7);

        return firebaseAuthService.verifyToken(idToken);
    }
}
