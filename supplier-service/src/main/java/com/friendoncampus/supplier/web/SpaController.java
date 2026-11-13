package com.friendoncampus.supplier.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class SpaController {

    @GetMapping({
            "/",
            "/suppliers",
            "/suppliers/{*path}",
            "/admin/suppliers",
            "/admin/suppliers/{*path}"
    })
    public String forwardToFrontend() {
        return "forward:/supplier-assets/index.html";
    }
}
