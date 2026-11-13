import { z } from "zod";

const NUS_EMAIL = /@(u\.nus\.edu|nus\.edu\.sg)$/;

export const FullName = z.string().trim().min(1, "is required").max(100);

export const Username = z
    .string()
    .trim()
    .min(3, "must be at least 3 characters")
    .max(30, "must be at most 30 characters")
    .regex(/^[A-Za-z0-9._-]+$/, "may only contain letters, digits, dot, underscore and hyphen");

export const Password = z
    .string()
    .min(8, "must be at least 8 characters")
    .max(128, "must be at most 128 characters");

export const RegisterBody = z.object({
    fullName: FullName,
    email: z
        .string()
        .trim()
        .toLowerCase()
        .pipe(z.email("is not a valid email address"))
        .refine((email) => NUS_EMAIL.test(email), "must end with @u.nus.edu or @nus.edu.sg"),
    username: Username,
    password: Password
});

export const VerifyBody = z.object({
    email: z.string().trim().toLowerCase().pipe(z.email("is not a valid email address")),
    code: z.string().trim().regex(/^\d{6}$/, "must be 6 digits")
});

export const ResendBody = z.object({
    email: z.string().trim().toLowerCase().pipe(z.email("is not a valid email address"))
})

export const LoginBody = z.object({
    identifier: z.string().trim().min(1, "is required"),
    password: z.string().min(1, "is required")
});

export type RegisterInput = z.infer<typeof RegisterBody>;