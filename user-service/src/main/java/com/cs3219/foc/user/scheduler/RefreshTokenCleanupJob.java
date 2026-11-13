package com.cs3219.foc.user.scheduler;

import com.cs3219.foc.user.service.TokenService;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class RefreshTokenCleanupJob {

    private final TokenService service;

    @Scheduled(cron = "0 0 * * * *")
    public void run() {
        service.cleanExpiredRefreshTokens();
    }
}
