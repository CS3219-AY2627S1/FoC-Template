export const REFRESH_TOKEN_EXPIRES_IN_DAYS = 7;

export const REFRESH_TOKEN_MAX_AGE =
    REFRESH_TOKEN_EXPIRES_IN_DAYS *
    24 *
    60 *
    60 *
    1000;

export const REFRESH_TOKEN_EXPIRES_IN =
    `${REFRESH_TOKEN_EXPIRES_IN_DAYS}d`;

export const ACCESS_TOKEN_EXPIRES_IN = "60m";

export const REGISTRATION_OTP_EXPIRES_IN_MINUTES = 10;

export const REGISTRATION_OTP_MAX_REQUESTS_PER_HOUR = 3;

export const REGISTRATION_OTP_MAX_VERIFY_ATTEMPTS = 5;

export const ADMIN_INVITATION_EXPIRES_IN_HOURS = 24;

export const ADMIN_INVITATION_RESEND_COOLDOWN_SECONDS = 60;

// Testing values for refresh token expiration and max age
// export const REFRESH_TOKEN_EXPIRES_IN_MINUTES = 3;

// export const REFRESH_TOKEN_MAX_AGE =
//     5 * 60 * 1000; // cookie lasts 5 minutes

// export const REFRESH_TOKEN_EXPIRES_IN =
//     `${REFRESH_TOKEN_EXPIRES_IN_MINUTES}m`;

// export const ACCESS_TOKEN_EXPIRES_IN = "1m";
