/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Implementation.
 * Scope: Generated or updated frontend code for the team-specified report form, order association, navigation, and completion reminder.
 * Author review: I reviewed for correctness
 */
import { expect, it } from "vitest"
import { REPORT_CATEGORIES, reportCategoryRequiresOrder, validReportCategory } from "@/lib/reporting"

it("requires associations only for order and courier categories", () => {
  expect(reportCategoryRequiresOrder("ORDER")).toBe(true)
  expect(reportCategoryRequiresOrder("ERRAND")).toBe(true)
  expect(validReportCategory("ERRAND")).toBe("ERRAND")
  expect(reportCategoryRequiresOrder("COURIER")).toBe(true)
  expect(reportCategoryRequiresOrder("CREDITS")).toBe(false)
  expect(reportCategoryRequiresOrder("GENERAL")).toBe(false)
  expect(validReportCategory("ORDER")).toBe("ORDER")
  expect(validReportCategory("unexpected")).toBe("GENERAL")
})

it("offers Request, Errand and General for new reports and normalizes retired deep links", () => {
  expect(Object.keys(REPORT_CATEGORIES)).toEqual(["ORDER", "ERRAND", "GENERAL"])
  expect(REPORT_CATEGORIES.ORDER).toBe("Request")
  expect(validReportCategory("COURIER")).toBe("GENERAL")
  expect(validReportCategory("CREDITS")).toBe("GENERAL")
})
