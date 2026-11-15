/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: bootstrapped the NestJS/Express Supplier backend.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-25; served bundled
 * Supplier assets and installed server-owned request/error handling for issue
 * #17, including a JSON ConsoleLogger for non-sensitive request completions.
 * Author review of additional changes: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-26; mounted the
 * issue #25 Supplier Swagger UI and OpenAPI JSON document.
 * Author review: Reviewed and approved by @ron.
 */
import "reflect-metadata";

import { ConsoleLogger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";

import { AppModule } from "./app.module";
import {
  getPort,
  getSupplierImageDirectory,
} from "./config/environment";
import {
  createSupplierCompletionLogger,
  createSupplierRequestMiddleware,
} from "./http/request-id";
import { SupplierHttpExceptionFilter } from "./http/supplier-http-exception.filter";
import { configureSupplierOpenApi } from "./openapi/swagger";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const completionLogger: ConsoleLogger = createSupplierCompletionLogger();
  app.use(createSupplierRequestMiddleware(completionLogger));
  app.useGlobalFilters(new SupplierHttpExceptionFilter());
  app.useStaticAssets(getSupplierImageDirectory(), {
    prefix: "/assets/suppliers/",
  });
  configureSupplierOpenApi(app);
  app.enableShutdownHooks();
  await app.listen(getPort(), "0.0.0.0");
}

void bootstrap();
