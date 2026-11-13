import { vi } from "vitest";

// Tests never send real mail. The mock records every code so a test can read it.
vi.mock("../src/lib/mailer.ts", () => ({ sendOtpMail: vi.fn() }));