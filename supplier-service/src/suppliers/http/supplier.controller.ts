/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: exposed authenticated Supplier catalogue list and detail endpoints with
 * strong detail ETags for issue #17.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-26; exposed the
 * administrator mutation routes, statuses, and headers for issue #22.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-26; attached the
 * issue #25 Supplier OpenAPI operation descriptions.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-27; exposed the
 * authenticated issue #33 Building Code metadata route.
 * Contract decision and implementation reviewed and approved by @ron.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from "@nestjs/common";

import {
  AuthenticatedSupplierRequest,
  RequireAuthentication,
  RequireSupplierRoles,
} from "../../auth/supplier-auth.guard";
import {
  BUILDING_OPTIONS,
  BuildingOption,
} from "../../domain/buildings";
import {
  ApiArchiveSupplier,
  ApiCreateSupplier,
  ApiGetSupplierMetadata,
  ApiGetSupplier,
  ApiListSuppliers,
  ApiRestoreSupplier,
  ApiSupplierController,
  ApiUpdateSupplier,
} from "../../openapi/supplier-api.decorators";
import {
  SupplierListPage,
  SupplierListQuery,
  SupplierReadModel,
} from "../read/supplier-read.types";
import { SupplierMutationValues } from "../supplier-mutation.values";
import { SupplierAdministrationService } from "./supplier-administration.service";
import { SupplierCatalogueService } from "./supplier-catalogue.service";
import { setSupplierEtag } from "./supplier-etag";
import { SupplierIdentifierPipe } from "./supplier-identifier.pipe";
import { SupplierListQueryPipe } from "./supplier-list-query.pipe";
import { SupplierMutationBodyPipe } from "./supplier-mutation-body.pipe";

interface HeaderResponse {
  setHeader(name: string, value: string): void;
}

@Controller("api/v1/suppliers")
@RequireAuthentication()
@ApiSupplierController()
export class SupplierController {
  constructor(
    private readonly catalogue: SupplierCatalogueService,
    private readonly administration: SupplierAdministrationService,
  ) {}

  @Get()
  @ApiListSuppliers()
  list(
    @Query(SupplierListQueryPipe) query: SupplierListQuery,
    @Req() request: AuthenticatedSupplierRequest,
  ): Promise<SupplierListPage> {
    return this.catalogue.list(query, request.principal);
  }

  @Get("metadata")
  @ApiGetSupplierMetadata()
  metadata(): { readonly buildingCodes: readonly BuildingOption[] } {
    return { buildingCodes: BUILDING_OPTIONS };
  }

  @Get(":id")
  @ApiGetSupplier()
  async detail(
    @Param("id", SupplierIdentifierPipe) supplierId: string,
    @Req() request: AuthenticatedSupplierRequest,
    @Res({ passthrough: true }) response: HeaderResponse,
  ): Promise<SupplierReadModel> {
    const supplier = await this.catalogue.get(supplierId, request.principal);
    setSupplierEtag(response, supplier.version);
    return supplier;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireSupplierRoles("ADMINISTRATOR")
  @ApiCreateSupplier()
  async create(
    @Body(SupplierMutationBodyPipe) values: SupplierMutationValues,
    @Res({ passthrough: true }) response: HeaderResponse,
  ): Promise<SupplierReadModel> {
    const supplier = await this.administration.create(values);
    response.setHeader("Location", `/api/v1/suppliers/${supplier.id}`);
    setSupplierEtag(response, supplier.version);
    return supplier;
  }

  @Put(":id")
  @RequireSupplierRoles("ADMINISTRATOR")
  @ApiUpdateSupplier()
  async update(
    @Param("id", SupplierIdentifierPipe) supplierId: string,
    @Headers("if-match") ifMatch: unknown,
    @Body(SupplierMutationBodyPipe) values: SupplierMutationValues,
    @Res({ passthrough: true }) response: HeaderResponse,
  ): Promise<SupplierReadModel> {
    const supplier = await this.administration.update(
      supplierId,
      ifMatch,
      values,
    );
    setSupplierEtag(response, supplier.version);
    return supplier;
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireSupplierRoles("ADMINISTRATOR")
  @ApiArchiveSupplier()
  archive(
    @Param("id", SupplierIdentifierPipe) supplierId: string,
    @Headers("if-match") ifMatch: unknown,
  ): Promise<void> {
    return this.administration.archive(supplierId, ifMatch);
  }

  @Post(":id/restore")
  @HttpCode(HttpStatus.OK)
  @RequireSupplierRoles("ADMINISTRATOR")
  @ApiRestoreSupplier()
  async restore(
    @Param("id", SupplierIdentifierPipe) supplierId: string,
    @Headers("if-match") ifMatch: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ): Promise<SupplierReadModel> {
    const supplier = await this.administration.restore(supplierId, ifMatch);
    setSupplierEtag(response, supplier.version);
    return supplier;
  }
}
