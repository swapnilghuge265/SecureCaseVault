// ---------------------------------------------------------------------------
// AI Document Intelligence service (the "ai_document_service").
//
// This facade is the single entry point for the rest of the app:
//   extractText()        — PDF (pdf-parse) / DOCX (mammoth) / TXT
//   analyzeText()        — classify + keywords + summary via the active provider
//   getAiProvider()      — provider selection (env-configured external, or the
//                          safe local rule-based fallback)
//
// AI logic lives here, never in route handlers.
// ---------------------------------------------------------------------------

import type { AiProvider, AnalysisResult } from "./types";
import { localProvider, DOCUMENT_CATEGORIES } from "./provider-local";
import { ExternalAiProvider } from "./provider-external";
import { extractText, isExtractableFormat, type ExtractedText } from "./text-extractor";

export { DOCUMENT_CATEGORIES };
export { extractText, isExtractableFormat, type ExtractedText } from "./text-extractor";
export { AiAnalysisError } from "./types";
export type { AiProvider, AnalysisResult } from "./types";

// Provider selection: an external AI API is used ONLY when the operator has
// explicitly configured all three environment variables. No key is ever
// hard-coded, stored, or logged.
export function getAiProvider(): AiProvider {
  const base = process.env.SCV_AI_API_BASE;
  const key = process.env.SCV_AI_API_KEY;
  const model = process.env.SCV_AI_MODEL;
  if (base && key && model) {
    return new ExternalAiProvider(base, key, model);
  }
  return localProvider;
}

/**
 * Classify + keyword extraction + summary for extracted text.
 * `providerLabel` tells the UI whether this is the prototype fallback or a
 * configured external model — the UI never implies more than it is.
 */
export async function analyzeText(text: string): Promise<AnalysisResult> {
  return getAiProvider().analyze(text);
}
