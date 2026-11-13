import type { FieldErrors } from "../util/supplierRules.ts";

export enum ErrorType {
    Invalid,
    NotFound,
    Conflict,
}

/**
 * An expected, user-facing failure of a supplier operation.
 * `fields` names the offending fields so the UI can highlight them (FR 5.5.4)
 */
export class SupplierError extends Error {
    type: ErrorType;
    fields?: FieldErrors;

    constructor(type: ErrorType, message: string, fields?: FieldErrors) {
        super(message);
        this.type = type;
        this.fields = fields;
    }
}

export const PgErrorCode = {
    uniqueViolation: "23505",
    checkViolation: "23514",
};
