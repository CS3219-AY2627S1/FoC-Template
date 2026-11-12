/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-09-18 to 2026-10-03
 * Scope (AI-23): Generated code and tests for the User Service endpoints, entities, validation and token handling I specified.
 * Tool and date: Anthropic Claude (model unrecorded), 2026-11-10
 * Scope (AI-28): Generated the account list endpoint, admin users page and their tests.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.account;

import com.campuscouriers.user.account.dto.AccountPageResponse;
import com.campuscouriers.user.account.dto.AccountResponse;
import com.campuscouriers.user.account.dto.AccountSummaryResponse;
import com.campuscouriers.user.account.dto.EmailResponse;
import com.campuscouriers.user.entity.Account;
import com.campuscouriers.user.entity.AccountType;
import com.campuscouriers.user.exception.EmailAlreadyRegisteredException;
import com.campuscouriers.user.exception.InsufficientPermissionException;
import com.campuscouriers.user.exception.InvalidAccountException;
import com.campuscouriers.user.exception.LastAdministratorException;
import com.campuscouriers.user.repository.AccountRepository;
import com.campuscouriers.user.security.access.AccessTokenClaims;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.campuscouriers.user.TestConstants.VALID_EMAIL;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class AccountServiceTest {

    @Mock private AccountRepository accountRepository;

    @InjectMocks private AccountService accountService;

    private final UUID callerId = new UUID(0L, 1L);
    private final UUID targetId = new UUID(0L, 2L);
    private final UUID otherAdminId = new UUID(0L, 3L);

    private final AccessTokenClaims administrator =
            new AccessTokenClaims(callerId, "admin@u.nus.edu", AccountType.Administrator);
    private final AccessTokenClaims student =
            new AccessTokenClaims(callerId, "bob@u.nus.edu", AccountType.Student);

    @DisplayName("Only Administrators may list accounts; the search is turned into a safe LIKE pattern")
    @Nested
    class ListAccountsTests {

        private final Page<AccountSummaryResponse> emptyPage = Page.empty(PageRequest.of(0, 20));

        @Test
        void listAccounts_asStudent_throwsWithoutQueryingTheRepository() {
            assertThatThrownBy(() -> accountService.listAccounts(null, null, 0, 20, student))
                    .isInstanceOf(InsufficientPermissionException.class);

            verifyNoInteractions(accountRepository);
        }

        @Test
        void listAccounts_withoutFilters_matchesEveryAccountOfEitherType() {
            when(accountRepository.searchSummaries(any(), any(), any())).thenReturn(emptyPage);

            accountService.listAccounts(null, null, 0, 20, administrator);

            verify(accountRepository).searchSummaries("%%", EnumSet.allOf(AccountType.class), PageRequest.of(0, 20));
        }

        @Test
        void listAccounts_withSearchAndType_trimsLowercasesAndFilters() {
            when(accountRepository.searchSummaries(any(), any(), any())).thenReturn(emptyPage);

            accountService.listAccounts("  Alice ", AccountType.Student, 3, 10, administrator);

            verify(accountRepository).searchSummaries("%alice%", EnumSet.of(AccountType.Student), PageRequest.of(3, 10));
        }

        @Test
        void listAccounts_mapsThePageMetadata() {
            AccountSummaryResponse row = new AccountSummaryResponse(targetId, VALID_EMAIL, "Alice", AccountType.Student);
            when(accountRepository.searchSummaries(any(), any(), any()))
                    .thenReturn(new PageImpl<>(List.of(row), PageRequest.of(1, 1), 3));

            AccountPageResponse response = accountService.listAccounts(null, null, 1, 1, administrator);

            assertThat(response.items()).containsExactly(row);
            assertThat(response.page()).isEqualTo(new AccountPageResponse.PageInfo(1, 1, 3, 3, true, true));
        }

        @Test
        void escapeLike_escapesWildcardsAndTheEscapeCharacter() {
            assertThat(AccountService.escapeLike("100%_a!b")).isEqualTo("100!%!_a!!b");
        }
    }

    @DisplayName("Only Administrators may change account types, and never their own")
    @Nested
    class PermissionTests {

        @ParameterizedTest
        @EnumSource(AccountType.class)
        void updateType_asStudent_throwsWithoutQueryingTheRepository(AccountType requested) {
            assertThatThrownBy(() -> accountService.updateType(targetId, requested, student))
                    .isInstanceOf(InsufficientPermissionException.class);

            verifyNoInteractions(accountRepository);
        }

        @ParameterizedTest
        @EnumSource(AccountType.class)
        void updateType_asAdministratorOnOwnAccount_throwsWithoutQueryingTheRepository(AccountType requested) {
            assertThatThrownBy(() -> accountService.updateType(callerId, requested, administrator))
                    .isInstanceOf(InsufficientPermissionException.class);

            verifyNoInteractions(accountRepository);
        }
    }

    @DisplayName("The target account shall exist")
    @Test
    void updateType_withMissingAccount_throws() {
        when(accountRepository.lockAllByTypeOrId(AccountType.Administrator, targetId))
                .thenReturn(List.of(account(callerId, AccountType.Administrator)));

        assertThatThrownBy(() -> accountService.updateType(targetId, AccountType.Administrator, administrator))
                .isInstanceOf(InvalidAccountException.class);
    }

    @DisplayName("Administrators may promote and demote other accounts")
    @Nested
    class ChangeTypeTests {

        @Test
        void updateType_promotingStudent_changesTypeToAdministrator() {
            Account target = account(targetId, AccountType.Student);
            when(accountRepository.lockAllByTypeOrId(AccountType.Administrator, targetId))
                    .thenReturn(List.of(account(callerId, AccountType.Administrator), target));

            AccountResponse response = accountService.updateType(targetId, AccountType.Administrator, administrator);

            assertThat(target.getType()).isEqualTo(AccountType.Administrator);
            assertThat(response).isEqualTo(new AccountResponse(targetId, VALID_EMAIL, AccountType.Administrator));
            verify(accountRepository).lockAllByTypeOrId(AccountType.Administrator, targetId);
        }

        @Test
        void updateType_demotingAdministratorWithOthersRemaining_changesTypeToStudent() {
            Account target = account(targetId, AccountType.Administrator);
            when(accountRepository.lockAllByTypeOrId(AccountType.Administrator, targetId))
                    .thenReturn(List.of(account(callerId, AccountType.Administrator), target));

            AccountResponse response = accountService.updateType(targetId, AccountType.Student, administrator);

            assertThat(target.getType()).isEqualTo(AccountType.Student);
            assertThat(response).isEqualTo(new AccountResponse(targetId, VALID_EMAIL, AccountType.Student));
        }

        @ParameterizedTest
        @EnumSource(AccountType.class)
        void updateType_withTheSameType_returnsTheAccountUnchanged(AccountType type) {
            Account target = account(targetId, type);
            when(accountRepository.lockAllByTypeOrId(AccountType.Administrator, targetId))
                    .thenReturn(List.of(account(callerId, AccountType.Administrator), target));

            AccountResponse response = accountService.updateType(targetId, type, administrator);

            assertThat(target.getType()).isEqualTo(type);
            assertThat(response).isEqualTo(new AccountResponse(targetId, VALID_EMAIL, type));
        }
    }

    @DisplayName("A demotion shall not leave zero administrators")
    @Nested
    class LastAdministratorTests {

        // e.g. the caller's token still says Administrator but they have since been demoted
        @Test
        void updateType_demotingTheLastAdministrator_throwsAndLeavesTypeUnchanged() {
            Account target = account(targetId, AccountType.Administrator);
            when(accountRepository.lockAllByTypeOrId(AccountType.Administrator, targetId))
                    .thenReturn(List.of(target));

            assertThatThrownBy(() -> accountService.updateType(targetId, AccountType.Student, administrator))
                    .isInstanceOf(LastAdministratorException.class);

            assertThat(target.getType()).isEqualTo(AccountType.Administrator);
        }

        @Test
        void updateType_demotingWithAnotherAdministratorRemaining_succeeds() {
            Account target = account(targetId, AccountType.Administrator);
            when(accountRepository.lockAllByTypeOrId(AccountType.Administrator, targetId))
                    .thenReturn(List.of(target, account(otherAdminId, AccountType.Administrator)));

            accountService.updateType(targetId, AccountType.Student, administrator);

            assertThat(target.getType()).isEqualTo(AccountType.Student);
        }
    }

    @DisplayName("The user service shall allow only the account owner to change the account email")
    @Nested
    class UpdateEmailTests {

        private static final String NEW_EMAIL = "alice.lim@u.nus.edu";

        private final AccessTokenClaims owner =
                new AccessTokenClaims(targetId, VALID_EMAIL, AccountType.Student);

        @Test
        void updateEmail_asOwner_changesPersistsAndReturnsTheEmail() {
            Account target = account(targetId, AccountType.Student);
            when(accountRepository.findById(targetId)).thenReturn(Optional.of(target));
            when(accountRepository.existsByEmail(NEW_EMAIL)).thenReturn(false);

            EmailResponse response = accountService.updateEmail(targetId, NEW_EMAIL, owner);

            assertThat(target.getEmail()).isEqualTo(NEW_EMAIL);
            assertThat(response).isEqualTo(new EmailResponse(NEW_EMAIL));
            verify(accountRepository).saveAndFlush(target);
        }

        @Test
        void updateEmail_withMixedCase_storesTheLowerCasedEmail() {
            Account target = account(targetId, AccountType.Student);
            when(accountRepository.findById(targetId)).thenReturn(Optional.of(target));
            when(accountRepository.existsByEmail(NEW_EMAIL)).thenReturn(false);

            EmailResponse response = accountService.updateEmail(targetId, "Alice.Lim@u.nus.edu", owner);

            assertThat(target.getEmail()).isEqualTo(NEW_EMAIL);
            assertThat(response).isEqualTo(new EmailResponse(NEW_EMAIL));
            verify(accountRepository).existsByEmail(NEW_EMAIL);
        }

        @DisplayName("Resubmitting the current email (in any case) is a no-op, not a duplicate")
        @Test
        void updateEmail_withTheCurrentEmail_returnsItWithoutSaving() {
            Account target = account(targetId, AccountType.Student);
            when(accountRepository.findById(targetId)).thenReturn(Optional.of(target));

            EmailResponse response = accountService.updateEmail(targetId, "ALICE@u.nus.edu", owner);

            assertThat(response).isEqualTo(new EmailResponse(VALID_EMAIL));
            verify(accountRepository, never()).existsByEmail(any());
            verify(accountRepository, never()).saveAndFlush(any());
        }

        @Test
        void updateEmail_toAnEmailAlreadyInUse_throwsAndLeavesEmailUnchanged() {
            Account target = account(targetId, AccountType.Student);
            when(accountRepository.findById(targetId)).thenReturn(Optional.of(target));
            when(accountRepository.existsByEmail(NEW_EMAIL)).thenReturn(true);

            assertThatThrownBy(() -> accountService.updateEmail(targetId, NEW_EMAIL, owner))
                    .isInstanceOf(EmailAlreadyRegisteredException.class);

            assertThat(target.getEmail()).isEqualTo(VALID_EMAIL);
            verify(accountRepository, never()).saveAndFlush(any());
        }

        // e.g. two concurrent requests both pass the existsByEmail check
        @Test
        void updateEmail_whenUniqueConstraintRejectsTheFlush_throwsEmailAlreadyRegistered() {
            Account target = account(targetId, AccountType.Student);
            when(accountRepository.findById(targetId)).thenReturn(Optional.of(target));
            when(accountRepository.existsByEmail(NEW_EMAIL)).thenReturn(false);
            when(accountRepository.saveAndFlush(target)).thenThrow(new DataIntegrityViolationException("duplicate"));

            assertThatThrownBy(() -> accountService.updateEmail(targetId, NEW_EMAIL, owner))
                    .isInstanceOf(EmailAlreadyRegisteredException.class);
        }

        @Test
        void updateEmail_asNonOwnerStudent_throwsWithoutQueryingTheRepository() {
            assertThatThrownBy(() -> accountService.updateEmail(targetId, NEW_EMAIL, student))
                    .isInstanceOf(InsufficientPermissionException.class);

            verifyNoInteractions(accountRepository);
        }

        @DisplayName("Administrators have no special access to other users' emails")
        @Test
        void updateEmail_asAdministratorOnAnotherAccount_throwsWithoutQueryingTheRepository() {
            assertThatThrownBy(() -> accountService.updateEmail(targetId, NEW_EMAIL, administrator))
                    .isInstanceOf(InsufficientPermissionException.class);

            verifyNoInteractions(accountRepository);
        }

        @Test
        void updateEmail_asOwnerWithMissingAccount_throws() {
            when(accountRepository.findById(targetId)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> accountService.updateEmail(targetId, NEW_EMAIL, owner))
                    .isInstanceOf(InvalidAccountException.class);

            verify(accountRepository, never()).saveAndFlush(any());
        }
    }

    // ---- Helpers ----
    private static Account account(UUID id, AccountType type) {
        Account account = new Account(type, VALID_EMAIL, "hashed-password");
        ReflectionTestUtils.setField(account, "id", id);
        return account;
    }

}
