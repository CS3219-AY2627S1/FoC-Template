package com.cs3219.foc.user.service;

import static com.cs3219.foc.user.config.NusConfig.ALLOWED_DOMAINS;

final class NusEmailPolicy {
    private NusEmailPolicy() {}

    static boolean isAllowed(String email) {
        return ALLOWED_DOMAINS.contains(email.substring(email.lastIndexOf('@') + 1));
    }
}
