/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-09
 * Scope: Implemented the team-specified translation language subset (ISO 639-1 codes).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */
// Subset specified by the team on 2026-11-09.
export const LANGUAGE_NAMES = {
  en: "English",
  zh: "Chinese",
  hi: "Hindi",
  ta: "Tamil",
  ms: "Malay",
  es: "Spanish",
  ar: "Arabic",
} as const;
export type LanguageCode = keyof typeof LANGUAGE_NAMES;
export const LANGUAGE_CODES = Object.keys(LANGUAGE_NAMES) as [
  LanguageCode,
  ...LanguageCode[],
];
