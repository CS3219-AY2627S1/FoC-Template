package com.cs3219.foc.user.controller;

import com.cs3219.foc.user.model.dto.PageDto;
import com.cs3219.foc.user.model.dto.UpdateEmailRequest;
import com.cs3219.foc.user.model.dto.UpdateUserProfileRequest;
import com.cs3219.foc.user.model.dto.UpdateUserRequest;
import com.cs3219.foc.user.model.dto.UserBriefDto;
import com.cs3219.foc.user.model.dto.UserDto;
import com.cs3219.foc.user.model.dto.UserProfileDto;
import com.cs3219.foc.user.model.dto.UserSearchCriteria;
import com.cs3219.foc.user.model.dto.VerifyEmailRequest;
import com.cs3219.foc.user.model.entity.UserRole;
import com.cs3219.foc.user.service.EmailChangeService;
import com.cs3219.foc.user.service.UserService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/users")
@RequiredArgsConstructor
public class UserController {
    private final UserService userService;
    private final EmailChangeService emailChangeService;

    @GetMapping("/brief")
    public List<UserBriefDto> briefs(@RequestParam @Size(min = 1, max = 200) List<UUID> ids) {
        return userService.getUserBriefs(ids);
    }

    @PostMapping("/email-change/confirm")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void confirmEmailChange(@Valid @RequestBody VerifyEmailRequest request) {
        emailChangeService.confirmChange(request.token());
    }

    @PostMapping("/me/email-change")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void requestEmailChange(@Valid @RequestBody UpdateEmailRequest request) {
        emailChangeService.requestChange(request.email());
    }

    @GetMapping
    public PageDto<UserDto> listUsers(
            @PageableDefault(size = 20, sort = "name", direction = Sort.Direction.ASC) Pageable pageable,
            @RequestParam(defaultValue = "") String search,
            @RequestParam(required = false) UserRole role,
            @RequestParam(required = false) String faculty) {
        return userService.listUsers(pageable, new UserSearchCriteria(search, role, faculty));
    }

    @GetMapping("/faculties")
    public List<String> getFaculties() {
        return userService.getFaculties();
    }

    @GetMapping("/{id}")
    public UserDto getUser(@PathVariable UUID id) {
        return userService.getUserDto(id);
    }

    @PatchMapping("/{id}")
    public UserDto updateUser(@PathVariable UUID id, @Valid @RequestBody UpdateUserRequest request) {
        return userService.updateUser(id, request);
    }

    @GetMapping("/me")
    public UserProfileDto getCurrentUser() {
        return userService.getUserProfile();
    }

    @PutMapping("/me")
    public UserProfileDto updateCurrentUser(@Valid @RequestBody UpdateUserProfileRequest request) {
        return userService.updateUserProfile(request);
    }
}
