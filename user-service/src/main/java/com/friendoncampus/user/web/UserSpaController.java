package com.friendoncampus.user.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class UserSpaController {

    @GetMapping("/")
    public String forwardToFrontend() {
        return "forward:/user-assets/index.html";
    }
}
