/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-26.
 * Scope: packaged the Supplier mutation persistence boundary and its Drizzle implementation.
 * Author review: Reviewed and approved by @ron.
 */
import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../database/database.module";
import { DrizzleSupplierMutationRepository } from "./drizzle-supplier-mutation.repository";
import { SupplierMutationRepository } from "./supplier-mutation.repository";

@Module({
  imports: [DatabaseModule],
  providers: [
    DrizzleSupplierMutationRepository,
    {
      provide: SupplierMutationRepository,
      useExisting: DrizzleSupplierMutationRepository,
    },
  ],
  exports: [SupplierMutationRepository],
})
export class SupplierMutationModule {}
