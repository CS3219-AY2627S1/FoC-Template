import { describe, expect, it } from "vitest"

import { readPublicConfig } from "./runtime-config"

describe("Request-time Admin and Report configuration", () => {
  it.each([
    ["local", "http://localhost:9099", undefined, "mock"],
    ["local", "http://localhost:9099", "mock", "mock"],
    ["local", "http://localhost:9099", "live", "live"],
    ["local", undefined, "mock", "live"],
    ["staging", undefined, "mock", "live"],
    ["production", "http://localhost:9099", "mock", "live"],
    ["local", "http://localhost:9099", "invalid", "live"],
    ["local", "http://localhost:9099", "", "live"],
  ])("selects %s / emulator %s / requested %s safely", (environment, emulator, requestedMode, expected) => {
    const config = readPublicConfig({ NODE_ENV: "test", FOC_ENVIRONMENT: environment,
      FOC_FIREBASE_AUTH_EMULATOR_URL: emulator, FOC_REPORT_API_MODE: requestedMode, FOC_ADMIN_API_MODE: "mock" })
    expect(config.adminApiMode).toBe("live")
    expect(config.reportApiMode).toBe(expected)
  })

  it("keeps Admin real and disables sample Reports when the image runs on staging", () => {
    const environment: NodeJS.ProcessEnv = { NODE_ENV: "test", FOC_ENVIRONMENT: "local",
      FOC_FIREBASE_AUTH_EMULATOR_URL: "http://localhost:9099", FOC_ADMIN_API_MODE: "mock" }
    expect(readPublicConfig(environment)).toMatchObject({ adminApiMode: "live", reportApiMode: "mock" })
    environment.FOC_ENVIRONMENT = "staging"
    const config = readPublicConfig(environment)
    expect(config.adminApiMode).toBe("live")
    expect(config.environment).toBe("staging")
    expect(config.reportApiMode).toBe("live")
    expect(config.authEmulatorUrl).toBe("http://localhost:9099")
    expect(config.firebase.projectId).toBe("demo-foc")
  })
})
