/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: packaged the Supplier catalogue read service and its Drizzle repository for later HTTP integration.
 * Author review: Reviewed and approved by @ron.
 */
import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../database/database.module";
import { DrizzleSupplierReadRepository } from "./drizzle-supplier-read.repository";
import { SupplierReadRepository } from "./supplier-read.repository";
import { SupplierReadService } from "./supplier-read.service";

@Module({
  imports: [DatabaseModule],
  providers: [
    DrizzleSupplierReadRepository,
    {
      provide: SupplierReadRepository,
      useExisting: DrizzleSupplierReadRepository,
    },
    SupplierReadService,
  ],
  exports: [SupplierReadService],
})
export class SupplierReadModule {}
