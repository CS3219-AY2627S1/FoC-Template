// OTP bodies for register / forgot / reset. Identity is email (or session email), not a JWT claim.
//AI declaration: From coderabbit comments more cleanly separate otpRequestSchema, challengeId representation, and request input
import { z } from 'zod';
import { NUS_EMAIL, registerSchema } from './registerDto';

//validation at zod layer
const otp = z
  .string()
  .length(6, { message: 'OTP must be exactly 6 digits' })
  .regex(/^\d+$/, { message: 'OTP must contain only numbers' });

export type otpRequestInput = { email: string; challengeId: string };

// Challenge is fixed as 'reset' in the service. Body is email only.
export const forgotPasswordSchema = z.object(
  {
    email: z
    .email('Invalid email address')
    .refine((e) => NUS_EMAIL.test(e), 'Email must be an NUS address (@nus.edu.sg or @u.nus.edu)')
    .transform((e) => e.toLowerCase()),
  }
)

// POST /users/forgot-password — unauthenticated complete step.
// Challenge is fixed as 'reset' in the service; the body carries the OTP.
export const completeForgotPasswordSchema = z.object({
  email: forgotPasswordSchema.shape.email,
  password: registerSchema.shape.password,
  otp,
});

// POST /users/reset-password/verify — complete; caller identity is the session, OTP is the code.
export const completeResetPasswordSchema = z.object({
  otp,
  newPassword: registerSchema.shape.password,
});

// POST /users/register/verify — public complete.
export const registerVerifySchema = z.object({
  email: registerSchema.shape.email, //re-use email validation
  otp,
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type CompleteForgotPasswordInput = z.infer<typeof completeForgotPasswordSchema>;
export type CompleteResetPasswordInput = z.infer<typeof completeResetPasswordSchema>;
export type RegisterVerifyInput = z.infer<typeof registerVerifySchema>;
