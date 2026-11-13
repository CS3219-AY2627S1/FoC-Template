/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-05
 * Mode: Code generation.
 * Scope: Generated the initial test code and provided testing assistance.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.user.authentication;

import com.google.firebase.auth.AuthErrorCode;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import com.google.firebase.auth.UserRecord;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import org.mockito.MockedStatic;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.*;

class FirebaseAuthServiceTest {

    private final FirebaseAuthService service = new FirebaseAuthService();

    // --------------------------------------------------
    // verifyToken()
    // --------------------------------------------------

    @Test
    void verifyTokenReturnsFirebaseTokenWhenValid() throws Exception {
        FirebaseAuth auth = mock(FirebaseAuth.class);
        FirebaseToken token = mock(FirebaseToken.class);

        try (MockedStatic<FirebaseAuth> mockedFirebase = mockStatic(FirebaseAuth.class)) {
            mockedFirebase.when(FirebaseAuth::getInstance).thenReturn(auth);
            when(auth.verifyIdToken("valid-token")).thenReturn(token);

            FirebaseToken result = service.verifyToken("valid-token");

            assertSame(token, result);
            verify(auth).verifyIdToken("valid-token");
        }
    }

    @Test
    void verifyTokenThrowsUnauthorizedWhenFirebaseVerificationFails() throws Exception {
        FirebaseAuth auth = mock(FirebaseAuth.class);
        FirebaseAuthException exception =
                mock(FirebaseAuthException.class);

        try (MockedStatic<FirebaseAuth> mockedFirebase = mockStatic(FirebaseAuth.class)) {
            mockedFirebase.when(FirebaseAuth::getInstance).thenReturn(auth);
            when(auth.verifyIdToken("invalid-token")).thenThrow(exception);

            ResponseStatusException thrown = assertThrows(
                    ResponseStatusException.class,
                    () -> service.verifyToken("invalid-token")
            );

            assertEquals(HttpStatus.UNAUTHORIZED, thrown.getStatusCode());
            assertEquals("Invalid authentication token", thrown.getReason());
        }
    }

    @Test
    void verifyTokenThrowsUnauthorizedWhenTokenIsMalformed() throws Exception {
        FirebaseAuth auth = mock(FirebaseAuth.class);

        try (MockedStatic<FirebaseAuth> mockedFirebase = mockStatic(FirebaseAuth.class)) {
            mockedFirebase.when(FirebaseAuth::getInstance).thenReturn(auth);
            when(auth.verifyIdToken("malformed-token"))
                    .thenThrow(new IllegalArgumentException("Malformed token"));

            ResponseStatusException thrown = assertThrows(
                    ResponseStatusException.class,
                    () -> service.verifyToken("malformed-token")
            );

            assertEquals(HttpStatus.UNAUTHORIZED, thrown.getStatusCode());
            assertEquals("Invalid authentication token", thrown.getReason());
        }
    }

    // --------------------------------------------------
    // getUser()
    // --------------------------------------------------

    @Test
    void getUserReturnsFirebaseUser() throws Exception {
        FirebaseAuth auth = mock(FirebaseAuth.class);
        UserRecord userRecord = mock(UserRecord.class);

        try (MockedStatic<FirebaseAuth> mockedFirebase = mockStatic(FirebaseAuth.class)) {
            mockedFirebase.when(FirebaseAuth::getInstance).thenReturn(auth);
            when(auth.getUser("firebase-uid")).thenReturn(userRecord);

            UserRecord result = service.getUser("firebase-uid");

            assertSame(userRecord, result);
            verify(auth).getUser("firebase-uid");
        }
    }

    @Test
    void getUserThrowsRuntimeExceptionWhenFirebaseFails() throws Exception {
        FirebaseAuth auth = mock(FirebaseAuth.class);
        FirebaseAuthException exception =
                mock(FirebaseAuthException.class);

        try (MockedStatic<FirebaseAuth> mockedFirebase = mockStatic(FirebaseAuth.class)) {
            mockedFirebase.when(FirebaseAuth::getInstance).thenReturn(auth);
            when(auth.getUser("firebase-uid")).thenThrow(exception);

            RuntimeException thrown = assertThrows(
                    RuntimeException.class,
                    () -> service.getUser("firebase-uid")
            );

            assertEquals("Failed to retrieve Firebase user", thrown.getMessage());
            assertSame(exception, thrown.getCause());
        }
    }

    // --------------------------------------------------
    // getVerifiedEmail()
    // --------------------------------------------------

    @Test
    void getVerifiedEmailReturnsEmailWhenVerified() throws Exception {
        FirebaseAuth auth = mock(FirebaseAuth.class);
        UserRecord userRecord = mock(UserRecord.class);

        try (MockedStatic<FirebaseAuth> mockedFirebase = mockStatic(FirebaseAuth.class)) {
            mockedFirebase.when(FirebaseAuth::getInstance).thenReturn(auth);
            when(auth.getUser("firebase-uid")).thenReturn(userRecord);
            when(userRecord.isEmailVerified()).thenReturn(true);
            when(userRecord.getEmail()).thenReturn("user@u.nus.edu");

            String result = service.getVerifiedEmail("firebase-uid");

            assertEquals("user@u.nus.edu", result);
        }
    }

    @Test
    void getVerifiedEmailThrowsConflictWhenEmailIsNotVerified() throws Exception {
        FirebaseAuth auth = mock(FirebaseAuth.class);
        UserRecord userRecord = mock(UserRecord.class);

        try (MockedStatic<FirebaseAuth> mockedFirebase = mockStatic(FirebaseAuth.class)) {
            mockedFirebase.when(FirebaseAuth::getInstance).thenReturn(auth);
            when(auth.getUser("firebase-uid")).thenReturn(userRecord);
            when(userRecord.isEmailVerified()).thenReturn(false);

            ResponseStatusException thrown = assertThrows(
                    ResponseStatusException.class,
                    () -> service.getVerifiedEmail("firebase-uid")
            );

            assertEquals(HttpStatus.CONFLICT, thrown.getStatusCode());
            assertEquals("Email has not been verified", thrown.getReason());
        }
    }

    @Test
    void getVerifiedEmailThrowsBadRequestWhenEmailIsNull() throws Exception {
        FirebaseAuth auth = mock(FirebaseAuth.class);
        UserRecord userRecord = mock(UserRecord.class);

        try (MockedStatic<FirebaseAuth> mockedFirebase = mockStatic(FirebaseAuth.class)) {
            mockedFirebase.when(FirebaseAuth::getInstance).thenReturn(auth);
            when(auth.getUser("firebase-uid")).thenReturn(userRecord);
            when(userRecord.isEmailVerified()).thenReturn(true);
            when(userRecord.getEmail()).thenReturn(null);

            ResponseStatusException thrown = assertThrows(
                    ResponseStatusException.class,
                    () -> service.getVerifiedEmail("firebase-uid")
            );

            assertEquals(HttpStatus.BAD_REQUEST, thrown.getStatusCode());
            assertEquals("Firebase user has no email address", thrown.getReason());
        }
    }

    @Test
    void getVerifiedEmailThrowsBadRequestWhenEmailIsBlank() throws Exception {
        FirebaseAuth auth = mock(FirebaseAuth.class);
        UserRecord userRecord = mock(UserRecord.class);

        try (MockedStatic<FirebaseAuth> mockedFirebase = mockStatic(FirebaseAuth.class)) {
            mockedFirebase.when(FirebaseAuth::getInstance).thenReturn(auth);
            when(auth.getUser("firebase-uid")).thenReturn(userRecord);
            when(userRecord.isEmailVerified()).thenReturn(true);
            when(userRecord.getEmail()).thenReturn("   ");

            ResponseStatusException thrown = assertThrows(
                    ResponseStatusException.class,
                    () -> service.getVerifiedEmail("firebase-uid")
            );

            assertEquals(HttpStatus.BAD_REQUEST, thrown.getStatusCode());
        }
    }

    // --------------------------------------------------
    // updateUserEmail()
    // --------------------------------------------------

    @Test
    void updateUserEmailUpdatesFirebaseUser() throws Exception {
        FirebaseAuth auth = mock(FirebaseAuth.class);

        try (MockedStatic<FirebaseAuth> mockedFirebase = mockStatic(FirebaseAuth.class)) {
            mockedFirebase.when(FirebaseAuth::getInstance).thenReturn(auth);

            service.updateUserEmail("firebase-uid", "new@u.nus.edu");

            verify(auth).updateUser(argThat(request -> request != null));
        }
    }

    @Test
    void updateUserEmailThrowsRuntimeExceptionWhenFirebaseFails() throws Exception {
        FirebaseAuth auth = mock(FirebaseAuth.class);
        FirebaseAuthException exception =
                mock(FirebaseAuthException.class);

        try (MockedStatic<FirebaseAuth> mockedFirebase = mockStatic(FirebaseAuth.class)) {
            mockedFirebase.when(FirebaseAuth::getInstance).thenReturn(auth);
            when(auth.updateUser(any(UserRecord.UpdateRequest.class)))
                    .thenThrow(exception);

            RuntimeException thrown = assertThrows(
                    RuntimeException.class,
                    () -> service.updateUserEmail("firebase-uid", "new@u.nus.edu")
            );

            assertEquals("Failed to update Firebase email", thrown.getMessage());
            assertSame(exception, thrown.getCause());
        }
    }

    // --------------------------------------------------
    // deleteUser()
    // --------------------------------------------------

    @Test
    void deleteUserDeletesFirebaseUser() throws Exception {
        FirebaseAuth auth = mock(FirebaseAuth.class);

        try (MockedStatic<FirebaseAuth> mockedFirebase = mockStatic(FirebaseAuth.class)) {
            mockedFirebase.when(FirebaseAuth::getInstance).thenReturn(auth);

            service.deleteUser("firebase-uid");

            verify(auth).deleteUser("firebase-uid");
        }
    }

    @Test
    void deleteUserThrowsRuntimeExceptionWhenFirebaseFails() throws Exception {
        FirebaseAuth auth = mock(FirebaseAuth.class);
        FirebaseAuthException exception =
                mock(FirebaseAuthException.class);

        try (MockedStatic<FirebaseAuth> mockedFirebase = mockStatic(FirebaseAuth.class)) {
            mockedFirebase.when(FirebaseAuth::getInstance).thenReturn(auth);
            doThrow(exception).when(auth).deleteUser("firebase-uid");

            RuntimeException thrown = assertThrows(
                    RuntimeException.class,
                    () -> service.deleteUser("firebase-uid")
            );

            assertEquals("Failed to delete Firebase user", thrown.getMessage());
            assertSame(exception, thrown.getCause());
        }
    }

    // --------------------------------------------------
    // deleteUserIfExists()
    // --------------------------------------------------

    @Test
    void deleteUserIfExistsDeletesFirebaseUser() throws Exception {
        FirebaseAuth auth = mock(FirebaseAuth.class);

        try (MockedStatic<FirebaseAuth> mockedFirebase = mockStatic(FirebaseAuth.class)) {
            mockedFirebase.when(FirebaseAuth::getInstance).thenReturn(auth);

            assertDoesNotThrow(() -> service.deleteUserIfExists("firebase-uid"));

            verify(auth).deleteUser("firebase-uid");
        }
    }

    @Test
    void deleteUserIfExistsIgnoresUserNotFoundError() throws Exception {
        FirebaseAuth auth = mock(FirebaseAuth.class);
        FirebaseAuthException exception =
                mock(FirebaseAuthException.class);

        try (MockedStatic<FirebaseAuth> mockedFirebase = mockStatic(FirebaseAuth.class)) {
            mockedFirebase.when(FirebaseAuth::getInstance).thenReturn(auth);

            when(exception.getAuthErrorCode())
                    .thenReturn(AuthErrorCode.USER_NOT_FOUND);

            doThrow(exception).when(auth).deleteUser("firebase-uid");

            assertDoesNotThrow(() -> service.deleteUserIfExists("firebase-uid"));
        }
    }

    @Test
    void deleteUserIfExistsThrowsWhenFirebaseReturnsAnotherError() throws Exception {
        FirebaseAuth auth = mock(FirebaseAuth.class);
        FirebaseAuthException exception = mock(FirebaseAuthException.class);

        try (MockedStatic<FirebaseAuth> mockedFirebase = mockStatic(FirebaseAuth.class)) {
            mockedFirebase.when(FirebaseAuth::getInstance).thenReturn(auth);

            when(exception.getAuthErrorCode())
                    .thenReturn(AuthErrorCode.INVALID_ID_TOKEN);

            doThrow(exception).when(auth).deleteUser("firebase-uid");

            RuntimeException thrown = assertThrows(
                    RuntimeException.class,
                    () -> service.deleteUserIfExists("firebase-uid")
            );

            assertEquals(
                    "Failed to delete Firebase account: firebase-uid",
                    thrown.getMessage()
            );
            assertSame(exception, thrown.getCause());
        }
    }
}