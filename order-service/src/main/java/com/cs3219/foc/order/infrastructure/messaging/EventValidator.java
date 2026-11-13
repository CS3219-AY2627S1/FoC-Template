package com.cs3219.foc.order.infrastructure.messaging;

import com.cs3219.foc.order.exception.ValidationFailedException;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.PropertyAccessorFactory;
import org.springframework.stereotype.Component;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.Validator;

@Component
@RequiredArgsConstructor
public class EventValidator {
    private static final int SUPPORTED_SCHEMA_VERSION = 1;
    private final Validator validator;

    public void validateEvent(Object event) {
        var errors = new BeanPropertyBindingResult(event, "event");
        validator.validate(event, errors);
        validateSchemaVersion(event, errors);

        if (errors.hasErrors()) {
            throw new ValidationFailedException("Event validation failed", errors);
        }
    }

    private static void validateSchemaVersion(Object event, BeanPropertyBindingResult errors) {
        var properties = PropertyAccessorFactory.forBeanPropertyAccess(event);
        var schemaVersion = properties.getPropertyValue("schemaVersion");

        if (!Objects.equals(schemaVersion, SUPPORTED_SCHEMA_VERSION)) {
            errors.rejectValue("schemaVersion", "UnsupportedSchemaVersion", "must be " + SUPPORTED_SCHEMA_VERSION);
        }
    }
}
