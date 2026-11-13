package com.friendoncampus.supplier.web.validation;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.Set;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

public class HttpUrlValidator implements ConstraintValidator<HttpUrl, String> {

    private static final Set<String> ALLOWED_SCHEMES = Set.of("http", "https");

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        if (value == null) {
            return true;
        }

        try {
            URI uri = new URI(value);
            String scheme = uri.getScheme();
            return uri.isAbsolute()
                    && scheme != null
                    && ALLOWED_SCHEMES.contains(scheme.toLowerCase(Locale.ROOT))
                    && uri.getHost() != null;
        } catch (URISyntaxException exception) {
            return false;
        }
    }
}
