package com.cs3219.foc.order.exception;

import org.springframework.http.HttpStatus;

public class ErrandAiException extends RuntimeException {
    private final HttpStatus status;
    private final String code;

    public ErrandAiException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }

    public static ErrandAiException unavailable() {
        return new ErrandAiException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "AI_UNAVAILABLE",
                "AI assistance is unavailable. You can continue in the form.");
    }

    public static ErrandAiException invalidResponse() {
        return new ErrandAiException(
                HttpStatus.BAD_GATEWAY,
                "AI_INVALID_RESPONSE",
                "Unable to read the AI reply. Your previous draft is unchanged.");
    }
}
