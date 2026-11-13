import { z } from "zod";
import { AppError } from "../errors.ts";

export type FieldErrors = Record<string, string[]>;

// A missing field should read "is required" instead of zod's
// "Invalid input: expected string, received undefined".
z.config({
    customError: (issue) => issue.code === "invalid_type" && issue.input === undefined ? "is required" : undefined
});

export function fieldErrorsOf(error: z.ZodError): FieldErrors {
    const fields: FieldErrors = {}
    for (const issue of error.issues) {
        const field = issue.path.join(".") || "body";
        (fields[field] ??= []).push(issue.message);
    }
    return fields;
}

export function validationError(fields: FieldErrors): AppError {
    return new AppError(400, "VALIDATION_FAILED", "One or more fields are invalid", { fields });
}