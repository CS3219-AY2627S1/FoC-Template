package com.friendoncampus.credit.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class CreditSpaController {

    @GetMapping({"/credits", "/credits/{*path}"})
    public String forwardToFrontend() {
        return "forward:/credit-assets/index.html";
    }
}
