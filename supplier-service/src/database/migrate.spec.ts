/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: verified least-privilege grants prevent runtime deletion of Supplier records.
 * Author review: Reviewed and approved by @ron.
 */
import { Pool } from "pg";

import { grantRuntimePrivileges } from "./migrate";

describe("Supplier runtime database privileges", () => {
  it("allows category replacement without allowing Supplier deletion", async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const pool = { query } as unknown as Pool;

    await grantRuntimePrivileges(pool, "supplier_app");

    expect(query.mock.calls.map(([statement]) => statement)).toEqual([
      'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM "supplier_app"',
      'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM "supplier_app"',
      'GRANT SELECT, INSERT, UPDATE ON TABLE public.suppliers TO "supplier_app"',
      'GRANT SELECT, INSERT, DELETE ON TABLE public.supplier_categories TO "supplier_app"',
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM "supplier_app"',
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM "supplier_app"',
    ]);
  });
});
