package com.cs3219.foc.user.controller;

import com.cs3219.foc.user.model.dto.UserProfileDto;
import com.cs3219.foc.user.service.AvatarService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/users")
@RequiredArgsConstructor
public class AvatarController {
    private final AvatarService avatarService;

    @PutMapping(value = "/me/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public UserProfileDto uploadAvatar(@RequestPart("file") MultipartFile file) {
        return avatarService.uploadAvatar(file);
    }

    @DeleteMapping("/me/avatar")
    public ResponseEntity<Void> removeAvatar() {
        avatarService.removeAvatar();
        return ResponseEntity.noContent().build();
    }
}
