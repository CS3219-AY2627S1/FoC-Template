/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: added Supplier Identifier validation that accepts durable UUIDv5 seed
 * identifiers and adopted shared UUID/error helpers for issue #17.
 * Author review: Reviewed and approved by @ron.
 */
import { Injectable, PipeTransform } from "@nestjs/common";

import { supplierValidationException } from "../../http/supplier-http-errors";
import { isUuid } from "../../http/uuid";

@Injectable()
export class SupplierIdentifierPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isUuid(value)) {
      throw supplierValidationException(
        "Please correct the Supplier Identifier.",
        { id: "Supplier Identifier must be a UUID." },
      );
    }
    return value;
  }
}
