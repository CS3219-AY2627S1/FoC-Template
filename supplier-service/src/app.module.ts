/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: wired the Supplier backend foundation and readiness endpoint.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-25; registered the
 * Supplier authentication module for issue #16.
 * Author review of additional changes: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-25; composed the
 * authenticated Supplier catalogue API for issue #17.
 * Author review of issue #17 changes: Reviewed and approved by @ron.
 */
import { Module } from "@nestjs/common";

import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health/health.controller";
import { HealthService } from "./health/health.service";
import { SupplierModule } from "./suppliers/supplier.module";

@Module({
  imports: [DatabaseModule, SupplierModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}
