/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-09
 * Scope: Added the team-specified preferred-language subset (ISO 639-1) for the account setting.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */

// Subset specified by the team on 2026-11-09; the codes match user-service and chat-service.
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: 'Chinese' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ta', label: 'Tamil' },
  { code: 'ms', label: 'Malay' },
  { code: 'es', label: 'Spanish' },
  { code: 'ar', label: 'Arabic' },
]
