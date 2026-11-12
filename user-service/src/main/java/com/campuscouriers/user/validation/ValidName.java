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
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.lang.annotation.Documented;
import java.lang.annotation.Retention;
import java.lang.annotation.Target;

import static java.lang.annotation.ElementType.*;
import static java.lang.annotation.RetentionPolicy.RUNTIME;

// Profile name rules, shared by registration and name updates so they cannot drift apart
@NotBlank
@Size(max = 50)
@Documented
@Constraint(validatedBy = {})
@Target({FIELD, PARAMETER, METHOD, ANNOTATION_TYPE, TYPE_USE})
@Retention(RUNTIME)
public @interface ValidName {

    String message() default "Name must not be blank and must be at most 50 characters";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

}
