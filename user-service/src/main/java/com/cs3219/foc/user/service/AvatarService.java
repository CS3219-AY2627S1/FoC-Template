package com.cs3219.foc.user.service;

import com.cs3219.foc.user.exception.UserNotFoundException;
import com.cs3219.foc.user.mapper.UserMapper;
import com.cs3219.foc.user.model.dto.UserProfileDto;
import com.cs3219.foc.user.model.dto.event.AvatarDeletionRequestedEvent;
import com.cs3219.foc.user.model.entity.User;
import com.cs3219.foc.user.repository.UserRepository;
import com.cs3219.foc.user.security.CurrentUserService;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

@Service
@Slf4j
@RequiredArgsConstructor
public class AvatarService {
    private final UserRepository userRepository;
    private final UserMapper userMapper;
    private final AvatarStorageService avatarStorageService;
    private final AvatarImageProcessor avatarImageProcessor;
    private final TransactionTemplate transactionTemplate;
    private final ApplicationEventPublisher eventPublisher;
    private final CurrentUserService currentUserService;

    public UserProfileDto uploadAvatar(MultipartFile file) {
        var userId = currentUserService.requireCurrentUserId();
        return uploadAvatar(userId, file);
    }

    public UserProfileDto uploadAvatar(UUID userId, MultipartFile file) {
        var bytes = avatarImageProcessor.processAvatar(file);
        var key = storeAvatar(userId, bytes);

        try {
            return transactionTemplate.execute(status -> {
                var user = changeAvatar(userId, key);

                return buildUserProfileDto(user);
            });
        } catch (CannotCreateTransactionException failure) {
            cleanupFailedUpload(key, failure);

            throw failure;
        }
    }

    @Transactional
    public void removeAvatar(UUID userId) {
        changeAvatar(userId, null);
    }

    @Transactional
    public void removeAvatar() {
        var userId = currentUserService.requireCurrentUserId();
        removeAvatar(userId);
    }

    private String storeAvatar(UUID userId, byte[] bytes) {
        var key = avatarStorageService.createAvatarKey(userId);

        try {
            avatarStorageService.storeAvatar(key, bytes);
            return key;
        } catch (RuntimeException failure) {
            cleanupFailedUpload(key, failure);

            throw failure;
        }
    }

    private User changeAvatar(UUID userId, String newKey) {
        if (newKey != null) {
            deleteUploadOnRollback(newKey);
        }

        var user =
                userRepository.findForUpdateById(userId).orElseThrow(() -> new UserNotFoundException("User not found"));
        var previousKey = user.getAvatarKey();

        user.setAvatarKey(newKey);
        userRepository.flush();

        if (previousKey != null) {
            var deletion = new AvatarDeletionRequestedEvent(previousKey);
            eventPublisher.publishEvent(deletion);
        }

        return user;
    }

    private void deleteUploadOnRollback(String key) {
        var rollbackCleanup = new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                switch (status) {
                    case STATUS_ROLLED_BACK -> {
                        try {
                            avatarStorageService.deleteAvatar(key);
                        } catch (RuntimeException failure) {
                            log.warn("Could not delete unreferenced image: key={}", key, failure);
                        }
                    }
                    case STATUS_UNKNOWN ->
                        log.warn("Image transaction outcome unknown; verify reference for key={}", key);
                    default -> {}
                }
            }
        };

        TransactionSynchronizationManager.registerSynchronization(rollbackCleanup);
    }

    private void cleanupFailedUpload(String key, RuntimeException originalFailure) {
        try {
            avatarStorageService.deleteAvatar(key);
        } catch (RuntimeException cleanupFailure) {
            originalFailure.addSuppressed(cleanupFailure);
            log.warn("Could not delete unreferenced image: key={}", key, cleanupFailure);
        }
    }

    private UserProfileDto buildUserProfileDto(User user) {
        var avatarKey = user.getAvatarKey();
        var avatarUrl = avatarStorageService.createPresignedUrl(avatarKey);

        return userMapper.toUserProfileDto(user, avatarUrl);
    }
}
