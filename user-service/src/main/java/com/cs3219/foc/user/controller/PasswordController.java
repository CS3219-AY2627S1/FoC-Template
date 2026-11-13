package com.cs3219.foc.user.controller;

import com.cs3219.foc.user.model.dto.ChangePasswordRequest;
import com.cs3219.foc.user.service.AuthCookieFactory;
import com.cs3219.foc.user.service.PasswordService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/users/me/password")
@RequiredArgsConstructor
public class PasswordController {
    private final PasswordService passwordService;
    private final AuthCookieFactory authCookieFactory;

    @PutMapping
    public ResponseEntity<Void> changePassword(@Valid @RequestBody ChangePasswordRequest request) {
        passwordService.changePassword(request);
        return ResponseEntity.noContent()
                .header(
                        HttpHeaders.SET_COOKIE,
                        authCookieFactory.clearRefreshTokenCookie().toString())
                .build();
    }
}
