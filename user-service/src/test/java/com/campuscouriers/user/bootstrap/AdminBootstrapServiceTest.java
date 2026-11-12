/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-09-18 to 2026-10-03
 * Scope (AI-23): Generated code and tests for the User Service endpoints, entities, validation and token handling I specified.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.bootstrap;

import com.campuscouriers.user.account.AccountCreationService;
import com.campuscouriers.user.bootstrap.AdminBootstrapService.Outcome;
import com.campuscouriers.user.entity.AccountType;
import com.campuscouriers.user.exception.AdminBootstrapException;
import com.campuscouriers.user.exception.EmailAlreadyRegisteredException;
import com.campuscouriers.user.repository.AccountRepository;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static com.campuscouriers.user.TestConstants.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AdminBootstrapServiceTest {

    private static final ValidatorFactory validatorFactory = Validation.buildDefaultValidatorFactory();
    private static final Validator validator = validatorFactory.getValidator();

    @Mock private AccountRepository accountRepository;
    @Mock private AccountCreationService accountCreationService;

    @AfterAll
    static void closeValidatorFactory() {
        validatorFactory.close();
    }

    private AdminBootstrapService service(String name, String email, String password) {
        return new AdminBootstrapService(accountRepository, accountCreationService, validator,
                new AdminBootstrapProperties(name, email, password));
    }

    private AdminBootstrapService configured() {
        return service(VALID_NAME, VALID_EMAIL, VALID_PASSWORD);
    }

    private AdminBootstrapService unset() {
        return service("", "", "");
    }

    @DisplayName("Creates the first administrator when none exists")
    @Nested
    class CreationTests {

        @Test
        void bootstrap_whenNoAdministratorExists_createsAdministratorThroughSharedCreationPath() {
            when(accountRepository.existsByType(AccountType.Administrator)).thenReturn(false);

            assertThat(configured().bootstrap()).isEqualTo(Outcome.CREATED);

            verify(accountCreationService)
                    .create(AccountType.Administrator, VALID_EMAIL, VALID_PASSWORD, VALID_NAME);
        }

        @Test
        void bootstrap_acquiresLockBeforeCheckingForAnAdministrator() {
            when(accountRepository.existsByType(AccountType.Administrator)).thenReturn(false);

            configured().bootstrap();

            InOrder inOrder = inOrder(accountRepository, accountCreationService);
            inOrder.verify(accountRepository).acquireTransactionLock(AdminBootstrapService.ADVISORY_LOCK_KEY);
            inOrder.verify(accountRepository).existsByType(AccountType.Administrator);
            inOrder.verify(accountCreationService).create(any(), any(), any(), any());
        }

        @Test
        void bootstrap_whenEmailBelongsToExistingAccount_refusesToPromote() {
            when(accountRepository.existsByType(AccountType.Administrator)).thenReturn(false);
            when(accountCreationService.create(any(), any(), any(), any()))
                    .thenThrow(new EmailAlreadyRegisteredException());

            assertThatThrownBy(() -> configured().bootstrap())
                    .isInstanceOf(AdminBootstrapException.class)
                    .hasMessageContaining("refusing to promote");
        }
    }

    @DisplayName("Does nothing when an administrator already exists")
    @Nested
    class IdempotencyTests {

        @Test
        void bootstrap_whenAdministratorExists_isNoOp() {
            when(accountRepository.existsByType(AccountType.Administrator)).thenReturn(true);

            assertThat(configured().bootstrap()).isEqualTo(Outcome.ADMIN_EXISTS);

            verifyNoInteractions(accountCreationService);
        }

        @Test
        void bootstrap_whenAdministratorExistsAndNotConfigured_isNoOp() {
            when(accountRepository.existsByType(AccountType.Administrator)).thenReturn(true);

            assertThat(unset().bootstrap()).isEqualTo(Outcome.ADMIN_EXISTS);

            verifyNoInteractions(accountCreationService);
        }
    }

    @DisplayName("Missing or invalid variables")
    @Nested
    class ConfigurationTests {

        @Test
        void bootstrap_whenNotConfiguredAndNoAdministrator_reportsNotConfigured() {
            when(accountRepository.existsByType(AccountType.Administrator)).thenReturn(false);

            assertThat(unset().bootstrap()).isEqualTo(Outcome.NOT_CONFIGURED);

            verify(accountRepository, never()).acquireTransactionLock(anyLong());
            verifyNoInteractions(accountCreationService);
        }

        @Test
        void bootstrap_whenNullValues_reportsNotConfigured() {
            assertThat(service(null, null, null).bootstrap()).isEqualTo(Outcome.NOT_CONFIGURED);
        }

        @ParameterizedTest
        @CsvSource(value = {
                "'',            alice@u.nus.edu, TEST_Str0ngPassw0rd!",
                "Alice Tan,     '',              TEST_Str0ngPassw0rd!",
                "Alice Tan,     alice@u.nus.edu, ''",
                "Alice Tan,     '',              ''",
        })
        void bootstrap_whenPartiallyConfigured_failsWithoutTouchingTheDatabase(String name, String email, String password) {
            assertThatThrownBy(() -> service(name, email, password).bootstrap())
                    .isInstanceOf(AdminBootstrapException.class)
                    .hasMessageContaining("must be set together");

            verifyNoInteractions(accountRepository, accountCreationService);
        }

        @Test
        void bootstrap_whenPasswordViolatesPolicy_failsWithoutRevealingIt() {
            String weakPassword = "short";

            assertThatThrownBy(() -> service(VALID_NAME, VALID_EMAIL, weakPassword).bootstrap())
                    .isInstanceOf(AdminBootstrapException.class)
                    .hasMessageContaining("BOOTSTRAP_ADMIN_PASSWORD")
                    .message().doesNotContain(weakPassword);

            verifyNoInteractions(accountRepository, accountCreationService);
        }

        @Test
        void bootstrap_whenEmailIsOutsideNusDomain_fails() {
            assertThatThrownBy(() -> service(VALID_NAME, "admin@example.com", VALID_PASSWORD).bootstrap())
                    .isInstanceOf(AdminBootstrapException.class)
                    .hasMessageContaining("BOOTSTRAP_ADMIN_EMAIL");

            verifyNoInteractions(accountRepository, accountCreationService);
        }
    }

    @Test
    void properties_toString_masksPassword() {
        assertThat(new AdminBootstrapProperties(VALID_NAME, VALID_EMAIL, VALID_PASSWORD).toString())
                .doesNotContain(VALID_PASSWORD)
                .contains(VALID_EMAIL);
    }

}
