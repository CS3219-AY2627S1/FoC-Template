/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: implemented database-backed, non-sensitive readiness reporting.
 * Author review: Reviewed and approved by @ron.
 */
import { Injectable, ServiceUnavailableException } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";

export interface HealthResponse {
  status: "ok";
}

@Injectable()
export class HealthService {
  constructor(private readonly database: DatabaseService) {}

  async getReadiness(): Promise<HealthResponse> {
    try {
      await this.database.ping();
      return { status: "ok" };
    } catch {
      throw new ServiceUnavailableException({ status: "not_ready" });
    }
  }
}
