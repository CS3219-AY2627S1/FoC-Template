/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: tested required, bounded User Service verification runtime
 * configuration for issue #16.
 * Author review: Reviewed and approved by @ron.
 */
import { getSessionVerificationConfiguration } from "./environment";

const ORIGINAL_BASE_URL = process.env.USER_SERVICE_BASE_URL;
const ORIGINAL_TIMEOUT = process.env.USER_SERVICE_VERIFY_TIMEOUT_MS;

function restoreEnvironmentVariable(
  name: "USER_SERVICE_BASE_URL" | "USER_SERVICE_VERIFY_TIMEOUT_MS",
  value: string | undefined,
): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("getSessionVerificationConfiguration", () => {
  afterEach(() => {
    restoreEnvironmentVariable("USER_SERVICE_BASE_URL", ORIGINAL_BASE_URL);
    restoreEnvironmentVariable(
      "USER_SERVICE_VERIFY_TIMEOUT_MS",
      ORIGINAL_TIMEOUT,
    );
  });

  it("parses an HTTP(S) base URL and positive timeout", () => {
    process.env.USER_SERVICE_BASE_URL = "http://user-service:3001";
    process.env.USER_SERVICE_VERIFY_TIMEOUT_MS = "750";

    expect(getSessionVerificationConfiguration()).toEqual({
      userServiceBaseUrl: "http://user-service:3001/",
      timeoutMs: 750,
    });
  });

  it.each([undefined, "", "ftp://user-service", "not a URL"])(
    "rejects invalid base URL %p",
    (baseUrl) => {
      restoreEnvironmentVariable("USER_SERVICE_BASE_URL", baseUrl);
      process.env.USER_SERVICE_VERIFY_TIMEOUT_MS = "750";

      expect(() => getSessionVerificationConfiguration()).toThrow(
        /USER_SERVICE_BASE_URL/,
      );
    },
  );

  it.each([undefined, "", "0", "1.5", "-1", "2147483648"])(
    "rejects invalid timeout %p",
    (timeout) => {
      process.env.USER_SERVICE_BASE_URL = "https://users.example.test";
      restoreEnvironmentVariable("USER_SERVICE_VERIFY_TIMEOUT_MS", timeout);

      expect(() => getSessionVerificationConfiguration()).toThrow(
        /USER_SERVICE_VERIFY_TIMEOUT_MS/,
      );
    },
  );
});
