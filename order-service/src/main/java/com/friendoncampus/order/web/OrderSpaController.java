package com.friendoncampus.order.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/** Serves the packaged errand UI for every client-side route under {@code /errands}. */
@Controller
public class OrderSpaController {

    @GetMapping({"/errands", "/errands/{*path}"})
    public String forwardToFrontend() {
        return "forward:/order-assets/index.html";
    }
}
