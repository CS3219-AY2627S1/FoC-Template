package com.cs3219.foc.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.cs3219.foc.user.exception.EntityAlreadyExistsException;
import com.cs3219.foc.user.exception.UnsupportedEmailDomainException;
import com.cs3219.foc.user.exception.UserNotFoundException;
import com.cs3219.foc.user.model.dto.RegisterUserRequest;
import com.cs3219.foc.user.model.dto.UpdateUserProfileRequest;
import com.cs3219.foc.user.model.dto.UpdateUserRequest;
import com.cs3219.foc.user.model.dto.UserSearchCriteria;
import com.cs3219.foc.user.model.dto.event.UserCreatedEvent;
import com.cs3219.foc.user.model.entity.User;
import com.cs3219.foc.user.model.entity.UserRole;
import com.cs3219.foc.user.repository.UserRepository;
import com.cs3219.foc.user.security.CurrentUserService;
import com.cs3219.foc.user.support.TestMappers;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.ArgumentMatchers;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

class UserServiceTests {
    private static final ValidatorFactory VALIDATION = Validation.buildDefaultValidatorFactory();

    private final UserRepository repository = mock(UserRepository.class);
    private final ApplicationEventPublisher provisioning = mock(ApplicationEventPublisher.class);
    private final EmailVerificationService verification = mock(EmailVerificationService.class);
    private final AvatarStorageService avatarStorageService = mock(AvatarStorageService.class);
    private final PasswordEncoder encoder = new BCryptPasswordEncoder(4);
    private final EmailChangeService emailChangeService = mock(EmailChangeService.class);
    private final CurrentUserService currentUserService = mock(CurrentUserService.class);
    private final UserService service = new UserService(
            repository,
            encoder,
            TestMappers.mapper(),
            provisioning,
            verification,
            emailChangeService,
            avatarStorageService,
            currentUserService);
    private final UUID userId = UUID.randomUUID();
    private User user;

    @AfterAll
    static void closeValidation() {
        VALIDATION.close();
    }

    @BeforeEach
    void setUp() {
        user = User.builder()
                .id(userId)
                .name("Alex Tan")
                .email("alex@u.nus.edu")
                .passwordHash("stored-hash")
                .roles(List.of(UserRole.USER))
                .build();
        when(avatarStorageService.createPresignedUrl(any()))
                .thenAnswer(
                        call -> call.getArgument(0) == null ? null : "https://images.example/" + call.getArgument(0));
    }

    @Test
    void readsCurrentUserProfileFromAuthentication() {
        when(currentUserService.requireCurrentUserId()).thenReturn(userId);
        when(repository.findById(userId)).thenReturn(Optional.of(user));

        assertThat(service.getUserProfile().id()).isEqualTo(userId.toString());
    }

    @Test
    void updatesCurrentUserProfileFromAuthentication() {
        when(currentUserService.requireCurrentUserId()).thenReturn(userId);
        when(repository.findForUpdateById(userId)).thenReturn(Optional.of(user));
        when(repository.saveAndFlush(user)).thenReturn(user);

        var result = service.updateUserProfile(new UpdateUserProfileRequest("Jamie Tan", null, null));

        assertThat(result.name()).isEqualTo("Jamie Tan");
        assertThat(user.getEmail()).isEqualTo("alex@u.nus.edu");
    }

    @Test
    void retrievesProfileWithExistingMapper() {
        when(repository.findById(userId)).thenReturn(Optional.of(user));
        var result = service.getUserProfile(userId);
        assertThat(result.id()).isEqualTo(userId.toString());
        assertThat(result.name()).isEqualTo("Alex Tan");
        assertThat(result.email()).isEqualTo("alex@u.nus.edu");
        assertThat(result.roles()).containsExactly("USER");
        verify(repository, never()).saveAndFlush(any());
    }

    @Test
    void retrievesFullUserDtoWithDatesAndUserSpecificAvatarUrl() {
        var created = OffsetDateTime.parse("2026-01-01T00:00:00Z");
        var updated = OffsetDateTime.parse("2026-01-02T00:00:00Z");
        user.setCreatedAt(created);
        user.setUpdatedAt(updated);
        user.setAvatarKey("avatar.png");
        when(repository.findById(userId)).thenReturn(Optional.of(user));

        var result = service.getUserDto(userId);

        assertThat(result.avatarUrl()).isEqualTo("https://images.example/avatar.png");
        assertThat(result.createdAt()).isEqualTo(created);
        assertThat(result.updatedAt()).isEqualTo(updated);
        assertThat(result.email()).isEqualTo(user.getEmail());
    }

    @ParameterizedTest
    @ValueSource(strings = {"createdAt", "updatedAt"})
    void sortsUsersByTimestampPropertiesWithStableIdTieBreak(String property) {
        when(repository.findAll(ArgumentMatchers.<Specification<User>>any(), any(Pageable.class)))
                .thenReturn(Page.empty());

        service.listUsers(
                PageRequest.of(0, 20, Sort.by(Sort.Direction.DESC, property)), new UserSearchCriteria("", null, null));

        var pageable = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findAll(ArgumentMatchers.<Specification<User>>any(), pageable.capture());
        assertThat(pageable.getValue().getSort().stream().map(Sort.Order::getProperty))
                .containsExactly(property, "id");
        assertThat(pageable.getValue().getSort().getOrderFor(property).getDirection())
                .isEqualTo(Sort.Direction.DESC);
        assertThat(pageable.getValue().getSort().getOrderFor("id").getDirection())
                .isEqualTo(Sort.Direction.ASC);
    }

    @ParameterizedTest
    @ValueSource(strings = {"School of Computing", "UNASSIGNED"})
    void acceptsSupportedFacultyFilters(String faculty) {
        when(repository.findAll(ArgumentMatchers.<Specification<User>>any(), any(Pageable.class)))
                .thenReturn(Page.empty());

        service.listUsers(PageRequest.of(0, 20, Sort.by("name")), new UserSearchCriteria("", null, faculty));

        verify(repository).findAll(ArgumentMatchers.<Specification<User>>any(), any(Pageable.class));
    }

    @Test
    void rejectsUnknownFacultyFilter() {
        assertThatThrownBy(() -> service.listUsers(
                        PageRequest.of(0, 20, Sort.by("name")), new UserSearchCriteria("", null, "Unknown")))
                .isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(repository);
    }

    @Test
    void listsNusFaculties() {
        assertThat(service.getFaculties()).hasSize(15).contains("School of Computing", "Faculty of Science");
    }

    @Test
    void rejectsUnknownAdminFacultyBeforeReadingOrSaving() {
        assertThatThrownBy(() -> service.updateUser(
                        userId,
                        new UpdateUserRequest("Alex Tan", "alex@u.nus.edu", List.of(UserRole.USER), null, "Unknown")))
                .isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(repository);
    }

    @Test
    void rejectsUnknownProfileFacultyBeforeReadingOrSaving() {
        assertThatThrownBy(() ->
                        service.updateUserProfile(userId, new UpdateUserProfileRequest("Alex Tan", null, "Unknown")))
                .isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(repository);
    }

    @Test
    void adminCanSetAListedFaculty() {
        when(repository.findForUpdateById(userId)).thenReturn(Optional.of(user));
        when(repository.saveAndFlush(user)).thenReturn(user);

        var result = service.updateUser(
                userId,
                new UpdateUserRequest(
                        "Alex Tan", "alex@u.nus.edu", List.of(UserRole.USER), null, "School of Computing"));

        assertThat(result.faculty()).isEqualTo("School of Computing");
        verify(repository).saveAndFlush(user);
    }

    @Test
    void adminUpdateNormalizesAndClearsOptionalDetails() {
        user.setPhoneNumber("+6590000000");
        user.setFaculty("Science");
        when(repository.findForUpdateById(userId)).thenReturn(Optional.of(user));
        when(repository.saveAndFlush(user)).thenReturn(user);

        var result = service.updateUser(
                userId,
                new UpdateUserRequest(
                        " Alex Tan ", " ALEX@U.NUS.EDU ", List.of(UserRole.USER), " +65 9123-5436 ", "   "));

        assertThat(result.phoneNumber()).isEqualTo("+6591235436");
        assertThat(result.faculty()).isNull();
        assertThat(user.getPasswordHash()).isEqualTo("stored-hash");
    }

    @Test
    void adminUpdateOmittingOptionalDetailsPreservesThem() {
        user.setPhoneNumber("+6591235436");
        user.setFaculty("School of Computing");
        when(repository.findForUpdateById(userId)).thenReturn(Optional.of(user));
        when(repository.saveAndFlush(user)).thenReturn(user);

        var result = service.updateUser(
                userId, new UpdateUserRequest("Alex Tan", "alex@u.nus.edu", List.of(UserRole.USER), null, null));

        assertThat(result.phoneNumber()).isEqualTo("+6591235436");
        assertThat(result.faculty()).isEqualTo("School of Computing");
    }

    @Test
    void adminEmailUpdateRequestsVerificationWithoutChangingTheCurrentAddress() {
        when(repository.findForUpdateById(userId)).thenReturn(Optional.of(user));
        when(repository.saveAndFlush(user)).thenReturn(user);
        var result = service.updateUser(
                userId, new UpdateUserRequest("Updated name", "new@nus.edu.sg", List.of(UserRole.USER), null, null));
        verify(emailChangeService).requestChange(userId, "new@nus.edu.sg");
        assertThat(result.email()).isEqualTo("alex@u.nus.edu");
        assertThat(result.name()).isEqualTo("Updated name");
    }

    @ParameterizedTest
    @ValueSource(strings = {"jamie@u.nus.edu", "jamie@nus.edu.sg"})
    void registersAllowedNusEmails(String email) {
        when(repository.save(any(User.class))).thenAnswer(invocation -> {
            User saved = invocation.getArgument(0);
            saved.setId(userId);
            return saved;
        });
        var result = service.registerUser(new RegisterUserRequest(email, "Jamie", "password123"));
        assertThat(result.email()).isEqualTo(email);
        verify(repository).save(any(User.class));
        verify(provisioning)
                .publishEvent(ArgumentMatchers.<Object>argThat(event -> event instanceof UserCreatedEvent created
                        && created.payload().userId().equals(userId)));
        verify(verification).createRegistrationVerification(argThat(saved -> !saved.isEmailVerified()));
    }

    @ParameterizedTest
    @ValueSource(strings = {"jamie@gmail.com", "jamie@u.nus.edu.example.com"})
    void rejectsRegistrationWithUnsupportedDomain(String email) {
        assertThatThrownBy(() -> service.registerUser(new RegisterUserRequest(email, "Jamie", "password123")))
                .isInstanceOf(UnsupportedEmailDomainException.class);
        verifyNoInteractions(repository);
    }

    @Test
    void createsVerifiedAdminUsingNormalizedAccountDetails() {
        var adminId = UUID.randomUUID();
        when(repository.save(any(User.class))).thenAnswer(call -> {
            User saved = call.getArgument(0);
            saved.setId(adminId);
            return saved;
        });

        assertThat(service.initializeAdmin(new RegisterUserRequest(" ADMIN@U.NUS.EDU ", " Admin ", " password123 ")))
                .isTrue();

        verify(repository)
                .save(argThat(user -> user.getEmail().equals("admin@u.nus.edu")
                        && user.getName().equals("Admin")
                        && user.isEmailVerified()
                        && user.getRoles().equals(List.of(UserRole.USER, UserRole.ADMIN))
                        && encoder.matches(" password123 ", user.getPasswordHash())));
        verify(provisioning)
                .publishEvent(ArgumentMatchers.<Object>argThat(event -> event instanceof UserCreatedEvent created
                        && created.payload().userId().equals(adminId)
                        && created.schemaVersion() == 1));
        verifyNoInteractions(verification);
    }

    @Test
    void preservesExistingAdminIncludingItsPasswordAndVerificationState() {
        var existing = User.builder()
                .email("admin@u.nus.edu")
                .name("Existing admin")
                .passwordHash("original-hash")
                .roles(List.of(UserRole.USER, UserRole.ADMIN))
                .emailVerified(false)
                .build();
        when(repository.findByEmail(existing.getEmail())).thenReturn(Optional.of(existing));

        assertThat(service.initializeAdmin(new RegisterUserRequest(existing.getEmail(), "Changed", "replacement123")))
                .isFalse();

        assertThat(existing.getName()).isEqualTo("Existing admin");
        assertThat(existing.getPasswordHash()).isEqualTo("original-hash");
        assertThat(existing.isEmailVerified()).isFalse();
        verify(repository, never()).save(any());
        verifyNoInteractions(provisioning);
    }

    @Test
    void neverPromotesAnExistingNonAdmin() {
        var existing = User.builder().roles(List.of(UserRole.USER)).build();
        when(repository.findByEmail("admin@u.nus.edu")).thenReturn(Optional.of(existing));

        assertThatThrownBy(() ->
                        service.initializeAdmin(new RegisterUserRequest("admin@u.nus.edu", "Admin", "password123")))
                .isInstanceOf(EntityAlreadyExistsException.class);

        assertThat(existing.getRoles()).containsExactly(UserRole.USER);
        verify(repository, never()).save(any());
        verifyNoInteractions(provisioning);
    }

    @ParameterizedTest
    @ValueSource(strings = {"admin@example.com", "admin@u.nus.edu.example.com"})
    void rejectsNonNusAdmins(String email) {
        assertThatThrownBy(() -> service.initializeAdmin(new RegisterUserRequest(email, "Admin", "password123")))
                .isInstanceOf(UnsupportedEmailDomainException.class);
        verifyNoInteractions(repository, provisioning);
    }

    @Test
    void missingUserCannotBeReadOrUpdated() {
        when(repository.findById(userId)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.getUserProfile(userId)).isInstanceOf(UserNotFoundException.class);
        assertThatThrownBy(() -> service.updateUserProfile(userId, new UpdateUserProfileRequest("Alex", null, null)))
                .isInstanceOf(UserNotFoundException.class);
        verify(repository, never()).saveAndFlush(any());
    }

    @Test
    void updatesNormalizedProfileWithoutChangingIdentityOrCredentials() {
        when(repository.findForUpdateById(userId)).thenReturn(Optional.of(user));
        when(repository.saveAndFlush(user)).thenReturn(user);
        var result = service.updateUserProfile(
                userId, new UpdateUserProfileRequest("  Jamie Tan  ", "+65 9123 5436", " School of Computing "));
        assertThat(result.name()).isEqualTo("Jamie Tan");
        assertThat(result.email()).isEqualTo("alex@u.nus.edu");
        assertThat(result.phoneNumber()).isEqualTo("+6591235436");
        assertThat(result.faculty()).isEqualTo("School of Computing");
        assertThat(user.getId()).isEqualTo(userId);
        assertThat(user.getPasswordHash()).isEqualTo("stored-hash");
        assertThat(user.getRoles()).containsExactly(UserRole.USER);
    }
}
