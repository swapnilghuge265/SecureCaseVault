// ---------------------------------------------------------------------------
// External AI provider (OpenAI-compatible chat-completions API).
//
// ENABLED ONLY WHEN EXPLICITLY CONFIGURED via environment variables:
//   SCV_AI_API_BASE
//   SCV_AI_API_KEY
//   SCV_AI_MODEL
//
// Without all three set, getAiProvider() uses the local rule-based provider.
// ---------------------------------------------------------------------------

import type { AiProvider, AnalysisResult } from "./types";
import { AiAnalysisError } from "./types";
import { DOCUMENT_CATEGORIES } from "./provider-local";

const MAX_SENT_CHARS = 12_000;

const SYSTEM_PROMPT =
  "You analyze legal/investigation documents. Respond with ONLY a JSON object: " +
  '{"category": one of ' +
  JSON.stringify([...DOCUMENT_CATEGORIES]) +
  ', "summary": a 2-4 sentence factual summary, "keywords": up to 8 lowercase keywords}. ' +
  "Do not add commentary.";

export class ExternalAiProvider implements AiProvider {
  readonly name = "external-api";

  constructor(
    private baseUrl: string,
    private apiKey: string,
    private model: string,
  ) {}

  async analyze(text: string): Promise<AnalysisResult> {
    const body = text.slice(0, MAX_SENT_CHARS);

    let res: Response;

    try {
      res = await fetch(
        `${this.baseUrl.replace(/\/$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: 600,
            messages: [
              {
                role: "system",
                content: SYSTEM_PROMPT,
              },
              {
                role: "user",
                content: body,
              },
            ],
          }),
        },
      );
    } catch {
      throw new AiAnalysisError(
        "Could not reach the configured AI provider.",
      );
    }

    if (!res.ok) {
      throw new AiAnalysisError(
        `AI provider request failed (${res.status}).`,
      );
    }

    let data: {
      choices?: {
        message?: {
          content?: string;
        };
      }[];
    };

    try {
      data = await res.json();
    } catch {
      throw new AiAnalysisError(
        "AI provider returned an unreadable response.",
      );
    }

    const raw = data.choices?.[0]?.message?.content ?? "";

    const jsonText = raw
      .replace(/^```json\s*|\s*```$/g, "")
      .trim();

    let parsed: {
      category?: string;
      summary?: string;
      keywords?: string[];
    };

    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new AiAnalysisError(
        "AI provider returned an invalid analysis.",
      );
    }

    const category = DOCUMENT_CATEGORIES.includes(
      parsed.category as (typeof DOCUMENT_CATEGORIES)[number],
    )
      ? (parsed.category as string)
      : "Other";

    return {
      category,

      summary:
        parsed.summary ??
        "External AI analysis completed. Human verification is recommended.",

      keywords: Array.isArray(parsed.keywords)
        ? parsed.keywords
        : [],

      riskLevel: "MEDIUM",

      threatType: "External AI Analysis",

      confidence: 70,

      keyFindings: [],

      detectedThreats: [],

      timeline: [],

      recommendedActions: [
        "Review the AI-generated findings manually.",
        "Verify important evidence against the original document.",
      ],

      providerLabel: `External AI (${this.model})`,
    };
  }
}