package com.cs3219.foc.user.service;

import com.cs3219.foc.user.exception.EntityAlreadyExistsException;
import com.cs3219.foc.user.exception.UnsupportedEmailDomainException;
import com.cs3219.foc.user.exception.UserNotFoundException;
import com.cs3219.foc.user.mapper.UserMapper;
import com.cs3219.foc.user.model.dto.PageDto;
import com.cs3219.foc.user.model.dto.RegisterUserRequest;
import com.cs3219.foc.user.model.dto.UpdateUserProfileRequest;
import com.cs3219.foc.user.model.dto.UpdateUserRequest;
import com.cs3219.foc.user.model.dto.UserBriefDto;
import com.cs3219.foc.user.model.dto.UserDto;
import com.cs3219.foc.user.model.dto.UserProfileDto;
import com.cs3219.foc.user.model.dto.UserSearchCriteria;
import com.cs3219.foc.user.model.dto.event.UserCreatedEvent;
import com.cs3219.foc.user.model.entity.User;
import com.cs3219.foc.user.model.entity.UserRole;
import com.cs3219.foc.user.repository.UserRepository;
import com.cs3219.foc.user.repository.UserSpecifications;
import com.cs3219.foc.user.security.CurrentUserService;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class UserService {
    private final UserRepository userRepository;
    private final PasswordEncoder encoder;
    private final UserMapper userMapper;
    private final ApplicationEventPublisher events;
    private final EmailVerificationService emailVerification;
    private final EmailChangeService emailChangeService;
    private final AvatarStorageService avatarStorageService;
    private final CurrentUserService currentUserService;

    private static final String UNASSIGNED_FACULTY = "UNASSIGNED";

    private static final List<String> SORTABLE_PROPERTIES = List.of("name", "email", "createdAt", "updatedAt");

    @Transactional(readOnly = true)
    @PreAuthorize("isAuthenticated()")
    public List<UserBriefDto> getUserBriefs(List<UUID> ids) {
        if (ids.isEmpty() || ids.size() > 200) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Provide 1-200 user IDs");
        }
        return userRepository.findAllById(ids.stream().distinct().toList()).stream()
                .map(userMapper::toUserBriefDto)
                .toList();
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasRole('ADMIN')")
    public PageDto<UserDto> listUsers(Pageable pageable, UserSearchCriteria criteria) {
        validatePageable(pageable);
        validateSort(pageable.getSort());

        var faculty = criteria.faculty();
        validateFacultyFilter(faculty);

        var pageRequest = buildPageRequest(pageable);
        var search = criteria.search().strip().toLowerCase(Locale.ROOT);

        var filters = new ArrayList<Specification<User>>();
        if (!search.isEmpty()) {
            filters.add(UserSpecifications.matchesText(search));
        }
        if (criteria.role() != null) {
            filters.add(UserSpecifications.hasRole(criteria.role()));
        }
        if (UNASSIGNED_FACULTY.equals(faculty)) {
            filters.add(UserSpecifications.hasNoFaculty());
        } else if (faculty != null) {
            filters.add(UserSpecifications.hasFaculty(faculty));
        }

        var matches = userRepository.findAll(Specification.allOf(filters), pageRequest);
        var items = matches.map(this::buildUserDto).getContent();

        return new PageDto<>(items, matches.getTotalElements(), pageable.getPageNumber(), pageable.getPageSize());
    }

    public List<String> getFaculties() {
        return NusFacultyPolicy.getFaculties();
    }

    private void validateFacultyFilter(String faculty) {
        if (!NusFacultyPolicy.isValidForFiltering(faculty)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid faculty filter.");
        }
    }

    private void validateFaculty(String faculty) {
        if (!NusFacultyPolicy.isValidForAssignment(faculty)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid faculty.");
        }
    }

    private void validatePageable(Pageable pageable) {
        if (pageable.getPageNumber() < 0 || pageable.getPageSize() < 1 || pageable.getPageSize() > 100) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Page must be nonnegative and size must be 1–100.");
        }
    }

    private void validateSort(Sort sort) {
        var orders = sort.stream().toList();

        if (orders.size() != 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Sort must contain exactly one field.");
        }

        var property = orders.getFirst().getProperty();

        if (!SORTABLE_PROPERTIES.contains(property)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Sort must be one of: " + String.join(", ", SORTABLE_PROPERTIES) + ".");
        }
    }

    private PageRequest buildPageRequest(Pageable pageable) {
        var order = pageable.getSort().iterator().next();
        var sort = Sort.by(new Sort.Order(order.getDirection(), order.getProperty()))
                .and(Sort.by("id")); // stable sort
        return PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(), sort);
    }

    @Transactional
    @PreAuthorize("hasRole('ADMIN')")
    public UserDto updateUser(UUID id, UpdateUserRequest request) {
        validateFaculty(request.faculty());
        var user = userRepository.findForUpdateById(id).orElseThrow(() -> new UserNotFoundException("User not found"));

        validateRoleChange(user.getRoles(), request.roles());

        if (!request.email().equals(user.getEmail())) {
            emailChangeService.requestChange(id, request.email());
        }

        userMapper.updateUser(request, user);
        return buildUserDto(userRepository.saveAndFlush(user));
    }

    private void validateRoleChange(Collection<UserRole> currentRoles, Collection<UserRole> requestedRoles) {
        if (currentRoles.contains(UserRole.ADMIN) && !requestedRoles.contains(UserRole.ADMIN) && isLastAdmin()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The last admin cannot be demoted.");
        }
    }

    private boolean isLastAdmin() {
        return userRepository.countAllByRolesContains(UserRole.ADMIN.name()) <= 1;
    }

    @Transactional(readOnly = true)
    public UserProfileDto getUserProfile(UUID userId) {
        return buildUserProfileDto(getUser(userId));
    }

    @Transactional(readOnly = true)
    public UserProfileDto getUserProfile() {
        var userId = currentUserService.requireCurrentUserId();
        return getUserProfile(userId);
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasRole('ADMIN')")
    public UserDto getUserDto(UUID userId) {
        return buildUserDto(getUser(userId));
    }

    @Transactional
    public UserProfileDto updateUserProfile(UUID userId, UpdateUserProfileRequest request) {
        validateFaculty(request.faculty());
        // Avoid saving a stale password hash if a password change happens concurrently.
        var user =
                userRepository.findForUpdateById(userId).orElseThrow(() -> new UserNotFoundException("User not found"));
        userMapper.updateUserProfile(request, user);
        return buildUserProfileDto(userRepository.saveAndFlush(user));
    }

    @Transactional
    public UserProfileDto updateUserProfile(UpdateUserProfileRequest request) {
        var userId = currentUserService.requireCurrentUserId();
        return updateUserProfile(userId, request);
    }

    @Transactional(readOnly = true)
    public User getUser(UUID userId) {
        return userRepository.findById(userId).orElseThrow(() -> new UserNotFoundException("User not found"));
    }

    @Transactional
    public UserProfileDto registerUser(RegisterUserRequest request) {
        validateRegistration(request);

        var isExistingUser = userRepository.existsByEmail(request.email());
        if (isExistingUser) {
            throw new EntityAlreadyExistsException("User already exists with this email");
        }

        var savedUser = createUser(request, List.of(UserRole.USER), false);
        events.publishEvent(new UserCreatedEvent(
                UUID.randomUUID(), 1, OffsetDateTime.now(), new UserCreatedEvent.Payload(savedUser.getId())));
        emailVerification.createRegistrationVerification(savedUser);
        return buildUserProfileDto(savedUser);
    }

    @Transactional
    public boolean initializeAdmin(RegisterUserRequest request) {
        validateRegistration(request);

        var existingUser = userRepository.findByEmail(request.email()).orElse(null);
        if (existingUser != null) {
            if (!existingUser.getRoles().contains(UserRole.ADMIN)) {
                throw new EntityAlreadyExistsException("An account with this email exists without the ADMIN role");
            }
            return false;
        }

        var savedUser = createUser(request, List.of(UserRole.USER, UserRole.ADMIN), true);
        events.publishEvent(new UserCreatedEvent(
                UUID.randomUUID(), 1, OffsetDateTime.now(), new UserCreatedEvent.Payload(savedUser.getId())));
        return true;
    }

    private void validateRegistration(RegisterUserRequest request) {
        if (!NusEmailPolicy.isAllowed(request.email())) {
            throw new UnsupportedEmailDomainException();
        }
    }

    private User createUser(RegisterUserRequest request, List<UserRole> roles, boolean emailVerified) {
        return userRepository.save(User.builder()
                .email(request.email())
                .name(request.name())
                .passwordHash(encoder.encode(request.password()))
                .roles(roles)
                .emailVerified(emailVerified)
                .build());
    }

    private UserProfileDto buildUserProfileDto(User user) {
        var avatarKey = user.getAvatarKey();
        var avatarUrl = avatarStorageService.createPresignedUrl(avatarKey);
        return userMapper.toUserProfileDto(user, avatarUrl);
    }

    private UserDto buildUserDto(User user) {
        var avatarKey = user.getAvatarKey();
        var avatarUrl = avatarStorageService.createPresignedUrl(avatarKey);
        return userMapper.toUserDto(user, avatarUrl);
    }
}
