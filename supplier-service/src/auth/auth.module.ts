/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: wired the real User Service verifier behind the injectable
 * SessionVerifier seam for issue #16.
 * Author review: Reviewed and approved by @ron.
 */
import { Module } from "@nestjs/common";

import {
  getSessionVerificationConfiguration,
  SessionVerificationConfiguration,
} from "../config/environment";
import { SESSION_VERIFIER } from "./session-verifier";
import { SupplierAuthGuard } from "./supplier-auth.guard";
import { UserServiceSessionVerifier } from "./user-service-session-verifier";

const SESSION_VERIFICATION_CONFIGURATION = Symbol(
  "SESSION_VERIFICATION_CONFIGURATION",
);

@Module({
  providers: [
    {
      provide: SESSION_VERIFICATION_CONFIGURATION,
      useFactory: getSessionVerificationConfiguration,
    },
    {
      provide: SESSION_VERIFIER,
      inject: [SESSION_VERIFICATION_CONFIGURATION],
      useFactory: (configuration: SessionVerificationConfiguration) =>
        new UserServiceSessionVerifier(configuration),
    },
    SupplierAuthGuard,
  ],
  exports: [SESSION_VERIFIER, SupplierAuthGuard],
})
export class AuthModule {}
