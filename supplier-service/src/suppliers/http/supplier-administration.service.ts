/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-26.
 * Scope: implemented Supplier mutation application policy and stable HTTP
 * outcome mapping for issue #22.
 * Author review: Reviewed and approved by @ron.
 */
import { Injectable } from "@nestjs/common";

import {
  supplierAlreadyExistsException,
  supplierNotFoundException,
  supplierPreconditionRequiredException,
  supplierVersionConflictException,
} from "../../http/supplier-http-errors";
import { SupplierReadModel } from "../read/supplier-read.types";
import { SupplierMutationValues } from "../supplier-mutation.values";
import { SupplierMutationRepository } from "../write/supplier-mutation.repository";
import { parseSupplierIfMatch } from "./supplier-etag";

@Injectable()
export class SupplierAdministrationService {
  constructor(private readonly mutations: SupplierMutationRepository) {}

  async create(values: SupplierMutationValues): Promise<SupplierReadModel> {
    const result = await this.mutations.create(values);
    if (result.kind === "duplicate") {
      throw supplierAlreadyExistsException(result.existingSupplierId);
    }
    return result.supplier;
  }

  async update(
    supplierId: string,
    ifMatch: unknown,
    values: SupplierMutationValues,
  ): Promise<SupplierReadModel> {
    const result = await this.mutations.update(
      supplierId,
      requireSupplierVersion(ifMatch),
      values,
    );
    if (result.kind === "updated") {
      return result.supplier;
    }
    if (result.kind === "not-found") {
      throw supplierNotFoundException();
    }
    throw supplierVersionConflictException();
  }

  async archive(supplierId: string, ifMatch: unknown): Promise<void> {
    // Establish lifecycle state before interpreting If-Match. This preserves
    // the approved idempotent archive rule for every supplied header value.
    const initial = await this.mutations.archive(supplierId, null);
    if (initial.kind === "not-found") {
      throw supplierNotFoundException();
    }
    if (initial.kind === "already-archived" || initial.kind === "archived") {
      return;
    }
    if (initial.kind === "stale") {
      throw supplierVersionConflictException();
    }

    const result = await this.mutations.archive(
      supplierId,
      requireSupplierVersion(ifMatch),
    );
    if (result.kind === "not-found") {
      throw supplierNotFoundException();
    }
    if (result.kind === "stale") {
      throw supplierVersionConflictException();
    }
    if (result.kind === "precondition-required") {
      throw supplierPreconditionRequiredException();
    }
  }

  async restore(
    supplierId: string,
    ifMatch: unknown,
  ): Promise<SupplierReadModel> {
    const result = await this.mutations.restore(
      supplierId,
      requireSupplierVersion(ifMatch),
    );
    if (result.kind === "restored" || result.kind === "already-active") {
      return result.supplier;
    }
    if (result.kind === "not-found") {
      throw supplierNotFoundException();
    }
    throw supplierVersionConflictException();
  }
}

function requireSupplierVersion(ifMatch: unknown): bigint {
  if (ifMatch === undefined || ifMatch === null) {
    throw supplierPreconditionRequiredException();
  }
  return parseSupplierIfMatch(ifMatch);
}
