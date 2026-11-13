/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-05
 * Mode: Code generation.
 * Scope: Generated the initial test code and provided testing assistance.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.user.authentication;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.google.firebase.auth.FirebaseToken;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class AuthenticationServiceTest {

    @Mock
    private FirebaseAuthService firebaseAuthService;

    @InjectMocks
    private AuthenticationService authenticationService;

    @Mock
    private FirebaseToken firebaseToken;

    @Test
    void authenticateWithValidBearerTokenReturnsFirebaseToken() {
        String idToken = "valid-firebase-id-token";

        when(firebaseAuthService.verifyToken(idToken))
                .thenReturn(firebaseToken);

        FirebaseToken result = authenticationService.authenticate(
                "Bearer " + idToken
        );

        assertThat(result).isSameAs(firebaseToken);
        verify(firebaseAuthService).verifyToken(idToken);
    }

    @Test
    void authenticateWithNullHeaderThrowsUnauthorized() {
        assertThatThrownBy(() -> authenticationService.authenticate(null))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> {
                    ResponseStatusException responseException =
                            (ResponseStatusException) exception;

                    assertThat(responseException.getStatusCode())
                            .isEqualTo(HttpStatus.UNAUTHORIZED);

                    assertThat(responseException.getReason())
                            .isEqualTo("Missing authentication token");
                });

        verifyNoInteractions(firebaseAuthService);
    }

    @Test
    void authenticateWithoutBearerPrefixThrowsUnauthorized() {
        assertThatThrownBy(() ->
                authenticationService.authenticate("valid-firebase-id-token"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> {
                    ResponseStatusException responseException =
                            (ResponseStatusException) exception;

                    assertThat(responseException.getStatusCode())
                            .isEqualTo(HttpStatus.UNAUTHORIZED);

                    assertThat(responseException.getReason())
                            .isEqualTo("Missing authentication token");
                });

        verifyNoInteractions(firebaseAuthService);
    }

    @Test
    void authenticateWithIncorrectAuthorizationSchemeThrowsUnauthorized() {
        assertThatThrownBy(() ->
                authenticationService.authenticate("Basic some-token"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> {
                    ResponseStatusException responseException =
                            (ResponseStatusException) exception;

                    assertThat(responseException.getStatusCode())
                            .isEqualTo(HttpStatus.UNAUTHORIZED);
                });

        verifyNoInteractions(firebaseAuthService);
    }

    @Test
    void authenticateWithEmptyBearerTokenPassesEmptyTokenToFirebaseService() {
        when(firebaseAuthService.verifyToken(""))
                .thenReturn(firebaseToken);

        FirebaseToken result = authenticationService.authenticate("Bearer ");

        assertThat(result).isSameAs(firebaseToken);
        verify(firebaseAuthService).verifyToken("");
    }

    @Test
    void authenticatePropagatesFirebaseVerificationFailure() {
        RuntimeException exception =
                new RuntimeException("Invalid Firebase token");

        when(firebaseAuthService.verifyToken("invalid-token"))
                .thenThrow(exception);

        assertThatThrownBy(() ->
                authenticationService.authenticate("Bearer invalid-token"))
                .isSameAs(exception);

        verify(firebaseAuthService).verifyToken("invalid-token");
    }
}