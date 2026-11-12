/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-09-18 to 2026-10-03
 * Scope (AI-23): Generated code and tests for the User Service endpoints, entities, validation and token handling I specified.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

import java.lang.annotation.Documented;
import java.lang.annotation.Retention;
import java.lang.annotation.Target;

import static java.lang.annotation.ElementType.*;
import static java.lang.annotation.RetentionPolicy.RUNTIME;

// Email rules, shared by registration and email updates so they cannot drift apart
@NotBlank
@Email(
    regexp = "^[A-Za-z0-9._%+-]+@(.+\\.|yale-|duke-)?nus\\.edu(\\.sg)?$",
    message = "Email must belong to NUS domain"
)
@Documented
@Constraint(validatedBy = {})
@Target({FIELD, PARAMETER, METHOD, ANNOTATION_TYPE, TYPE_USE})
@Retention(RUNTIME)
public @interface NusEmail {

    String message() default "Email must belong to NUS domain";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

}
