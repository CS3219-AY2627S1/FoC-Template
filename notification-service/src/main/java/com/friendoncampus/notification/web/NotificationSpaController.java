package com.friendoncampus.notification.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/** Serves the packaged Notifications UI for every client-side route under {@code /notifications}. */
@Controller
public class NotificationSpaController {

    @GetMapping({"/notifications", "/notifications/{*path}"})
    public String forwardToFrontend() {
        return "forward:/notification-assets/index.html";
    }
}
