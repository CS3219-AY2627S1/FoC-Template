/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: exposed the Supplier-owned database connection within NestJS.
 * Author review: Reviewed and approved by @ron.
 */
import { Global, Module } from "@nestjs/common";

import { DatabaseService } from "./database.service";

@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
