package sg.edu.nus.foc.user.authentication;

import com.google.firebase.auth.AuthErrorCode;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import com.google.firebase.auth.UserRecord;
import com.google.firebase.auth.UserRecord.UpdateRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class FirebaseAuthService {

    public FirebaseToken verifyToken(String idToken) {

        try {
            return FirebaseAuth.getInstance().verifyIdToken(idToken);

        } catch (FirebaseAuthException | IllegalArgumentException e) {
            System.err.println("Firebase token verification failed:");
            e.printStackTrace();
            
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Invalid authentication token"
            );
        }
    }

    public UserRecord getUser(String firebaseUid) {
        try {
            return FirebaseAuth.getInstance().getUser(firebaseUid);
        } catch (FirebaseAuthException e) {
            throw new RuntimeException(
                    "Failed to retrieve Firebase user",
                    e
            );
        }
    }

    public String getVerifiedEmail(String firebaseUid) {
        UserRecord firebaseUser = getUser(firebaseUid);

        if (!firebaseUser.isEmailVerified()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Email has not been verified"
            );
        }

        String email = firebaseUser.getEmail();

        if (email == null || email.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Firebase user has no email address"
            );
        }

        return email;
    }

    public void updateUserEmail(String firebaseUid, String newEmail) {
        try {
            UpdateRequest request = new UpdateRequest(firebaseUid)
                    .setEmail(newEmail);

            FirebaseAuth.getInstance().updateUser(request);
        } catch (FirebaseAuthException e) {
            throw new RuntimeException("Failed to update Firebase email", e);
        }
    }

    public void deleteUser(String firebaseUid) {
        try {
            FirebaseAuth.getInstance().deleteUser(firebaseUid);
        } catch (FirebaseAuthException e) {
            throw new RuntimeException("Failed to delete Firebase user", e);
        }
    }

    // Delete function that checks specifically for USER_NOT_FOUND error
    public void deleteUserIfExists(String firebaseUid) {
        try {
            FirebaseAuth.getInstance().deleteUser(firebaseUid);
        } catch (FirebaseAuthException e) {
            if (e.getAuthErrorCode() == AuthErrorCode.USER_NOT_FOUND) {
                // The account is already deleted.
                // Treat this as success.
                return;
            }

            // Other failures not treated as successful deletion.
            throw new RuntimeException(
                    "Failed to delete Firebase account: " + firebaseUid, e);
        }
    }
}