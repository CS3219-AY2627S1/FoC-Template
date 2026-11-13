import { z } from "zod";
import { ACCOUNT_STATES, ROLES } from "../models/user.model.ts";
import { FullName, Password, Username } from "./auth.schemas.ts";

// strictObject rejects every other field, so email, roles and state cannot be
// changed through a profile update
export const ProfileUpdateBody = z
    .strictObject({
        fullName: FullName.optional(),
        username: Username.optional()
    })
    .refine((body) => body.fullName !== undefined || body.username !== undefined, {
        message: "must contain fullName or username"
    });

export const PasswordChangeBody = z.object({
    currentPassword: z.string().min(1, "is required"),
    newPassword: Password
})

export const PageQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20)
});

export const ListUsersQuery = PageQuery.extend({
    // F5.5.1: part of a full name, username or email address, or an exact account id
    q: z.string().trim().max(100, "must be at most 100 characters").optional(),
    state: z.enum(ACCOUNT_STATES, "must be PendingVerification, Active or Suspended").optional()
});

// F1.6.2 and F1.6.7: suspending, reinstating and deciding a report all need a reason of this length
const REASON_LENGTH = "must be between 20 and 500 characters";
export const Reason = z.string().trim().min(20, REASON_LENGTH).max(500, REASON_LENGTH);

export const StateChangeBody = z.object({
    state: z.enum(["Active", "Suspended"], "must be Active or Suspended"),
    reason: Reason
});

export const AuthorizeBody = z.object({
    token: z.string().min(1),
    requiredRole: z.enum(ROLES).default("member")
})