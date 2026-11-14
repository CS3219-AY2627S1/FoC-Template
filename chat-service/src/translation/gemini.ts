/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-09
 * Scope: Implemented the team-specified Gemini translation call (official SDK, JSON key/value
 *        in and out, "SAME" for text already in the target language).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { LANGUAGE_NAMES, type LanguageCode } from "./languages.js";

export const SAME = "SAME";
/** Maps message ids to text; resolves to the same ids mapped to translations or "SAME". */
export type Translator = (
  language: LanguageCode,
  messages: Record<string, string>,
) => Promise<Record<string, string>>;

export function systemPrompt(language: LanguageCode) {
  const name = LANGUAGE_NAMES[language];
  return (
    `Task: Translate messages into ${name}. INPUT: A JSON object of user messages whose keys are ` +
    `message ids with message texts as values. OUTPUT: A JSON object using the ` +
    `same keys, with each value being the ${name} translation of the original text. SPECIAL CASE: For text already in ` +
    `${name}, return the exact string "${SAME}" as its value instead.`
  );
}

const outputSchema = z.record(z.string(), z.unknown());

export function createGeminiTranslator(
  apiKey: string,
  model: string,
): Translator {
  const ai = new GoogleGenAI({ apiKey });
  return async (language, messages) => {
    const response = await ai.models.generateContent({
      model,
      contents: JSON.stringify(messages),
      config: {
        systemInstruction: systemPrompt(language),
        responseMimeType: "application/json",
      },
    });
    // Malformed output throws so the queue retries the job.
    const parsed = outputSchema.parse(JSON.parse(response.text ?? ""));
    const result: Record<string, string> = {};
    for (const key of Object.keys(messages)) {
      const value = parsed[key];
      // Keys the model dropped stay untranslated and are picked up by a later job.
      if (typeof value === "string" && value.trim().length > 0)
        result[key] = value;
    }
    return result;
  };
}
