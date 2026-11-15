/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: exposed the Supplier container readiness endpoint.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-26; documented the
 * readiness contract in the issue #25 OpenAPI document.
 * Author review: Reviewed and approved by @ron.
 */
import { Controller, Get } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from "@nestjs/swagger";

import {
  HealthResponseDto,
  SupplierErrorResponseDto,
} from "../openapi/supplier-api.dto";
import { HealthResponse, HealthService } from "./health.service";

@Controller()
@ApiTags("Health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get("health")
  @ApiOperation({ summary: "Check Supplier Service readiness" })
  @ApiOkResponse({
    description: "PostgreSQL is reachable and the service is ready.",
    type: HealthResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: "PostgreSQL is unavailable.",
    type: SupplierErrorResponseDto,
  })
  getHealth(): Promise<HealthResponse> {
    return this.health.getReadiness();
  }
}
