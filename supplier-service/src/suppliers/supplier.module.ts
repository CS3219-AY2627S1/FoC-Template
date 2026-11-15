/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: composed existing Supplier authentication and read-model seams behind
 * the catalogue HTTP API for issue #17.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-26; wired mutation
 * validation, application policy, and persistence for issue #22.
 * Author review: Reviewed and approved by @ron.
 */
import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { SupplierAdministrationService } from "./http/supplier-administration.service";
import { SupplierCatalogueService } from "./http/supplier-catalogue.service";
import { SupplierController } from "./http/supplier.controller";
import { SupplierIdentifierPipe } from "./http/supplier-identifier.pipe";
import { SupplierListQueryPipe } from "./http/supplier-list-query.pipe";
import { SupplierMutationBodyPipe } from "./http/supplier-mutation-body.pipe";
import { SupplierReadModule } from "./read/supplier-read.module";
import { SupplierMutationModule } from "./write/supplier-mutation.module";

@Module({
  imports: [AuthModule, SupplierReadModule, SupplierMutationModule],
  controllers: [SupplierController],
  providers: [
    SupplierCatalogueService,
    SupplierAdministrationService,
    SupplierIdentifierPipe,
    SupplierListQueryPipe,
    SupplierMutationBodyPipe,
  ],
})
export class SupplierModule {}
