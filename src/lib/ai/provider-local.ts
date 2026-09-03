// ---------------------------------------------------------------------------
// Local rule-based analysis provider — the PROTOTYPE FALLBACK.
//
// This is honest, simple NLP: keyword-frequency classification, stopword-
// filtered keyword extraction, and extractive summarization. It is NOT a
// language model, and the UI labels results as "Prototype Analysis".
//
// Swapping to a real model later means configuring the external provider
// (src/lib/ai/provider-external.ts) via environment variables — no route or
// UI changes required (see src/lib/ai/index.ts).
// ---------------------------------------------------------------------------

import type { AiProvider, AnalysisResult } from "./types";

// The seven document categories (fixed vocabulary, used by the UI too).
export const DOCUMENT_CATEGORIES = [
  "FIR",
  "Investigation Report",
  "Evidence",
  "Legal Document",
  "Statement",
  "Court Document",
  "Other",
] as const;

// Category term lists — phrases first (stronger signal), then single words.
const CATEGORY_TERMS: Record<string, string[]> = {
  "FIR": [
    "first information report", "fir", "cognizable", "offence reported",
    "reported to the police", "police station", "complaint filed",
    "registered against", "offence u/s",
  ],
  "Court Document": [
    "in the court of", "court of", "judgment", "judgement", "honor", "honour",
    "hearing of this", "docket", "order of the court", "in the matter of",
    "bench of", "appeal", "trial court", "petition",
  ],
  "Investigation Report": [
    "investigation", "investigative", "inquiry into", "findings",
    "evidence collected", "case analysis", "course of the investigation",
    "examined the", "report on the",
  ],
  "Statement": [
    "statement of", "witness statement", "i hereby state", "i state on oath",
    "sworn", "depose", "to the best of my knowledge", "statement given",
    "witness",
  ],
  "Evidence": [
    "chain of custody", "digital evidence", "forensic", "exhibit",
    "evidence", "sample", "seized", "hash value", "preserved for",
  ],
  "Legal Document": [
    "hereby", "pursuant to", "terms and conditions", "agreement",
    "contract", "notice to", "counsel", "liable", "indemnif", "jurisdiction",
    "whereas",
  ],
};

// Common English stopwords removed before keyword extraction.
const STOPWORDS = new Set(
  "the a an and or but if then else when while of to in on at by for with about against between into through during before after above below from up down out off over under again further once here there all any both each few more most other some such no nor not only own same so than too very can will just don should now this that these those is are was were be been being have has had do does did it its it's as which who whom what where why how".split(
    /\s+/,
  ),
);

// Domain terms always worth surfacing as keywords when present.
const DOMAIN_TERMS = [
  "case", "evidence", "investigation", "court", "witness", "accused",
  "complainant", "police", "fraud", "breach", "credentials", "document",
  "statement", "report", "offence", "jurisdiction", "timeline", "account",
];

function lower(text: string): string {
  return text.toLowerCase();
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) break;
    count++;
    from = at + needle.length;
  }
  return count;
}

// --- classify_document -------------------------------------------------------

export function classifyDocument(text: string): string {
  const t = lower(text);
  let best: string = "Other";
  let bestScore = 0;
  for (const [category, terms] of Object.entries(CATEGORY_TERMS)) {
    let score = 0;
    for (const term of terms) {
      const hits = countOccurrences(t, term);
      // Multi-word phrases are a stronger signal than single words.
      score += hits * (term.includes(" ") ? 3 : 1);
    }
    if (score > bestScore) {
      bestScore = score;
      best = category;
    }
  }
  return best;
}

// --- extract_keywords ----------------------------------------------------------

export function extractKeywords(text: string, limit = 8): string[] {
  const t = lower(text);

  // Frequency table over word tokens (3+ letters).
  const freq = new Map<string, number>();
  for (const token of t.split(/[^a-z0-9_]+/)) {
    if (token.length < 3 || STOPWORDS.has(token)) continue;
    freq.set(token, (freq.get(token) ?? 0) + 1);
  }

  // Guarantee relevant domain terms surface even at low frequency.
  const boosted = new Map<string, number>();
  for (const term of DOMAIN_TERMS) {
    if (t.includes(term)) boosted.set(term, 100 + (freq.get(term) ?? 0));
  }
  for (const [term, n] of freq) boosted.set(term, n);

  return [...boosted.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term]) => term);
}

// --- summarize_document ----------------------------------------------------------
// Extractive: score sentences by how many of the document's own keywords
// they contain, keep the best three (in original order).

export function summarizeDocument(text: string): string {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20);

  if (sentences.length === 0) return text.trim();
  if (sentences.length <= 2) return sentences.join(" ");

  const keywords = new Set(extractKeywords(text, 12));
  const scored = sentences.map((sentence, index) => {
    const words = sentence.toLowerCase().split(/[^a-z0-9_]+/);
    let score = 0;
    for (const w of words) if (keywords.has(w)) score++;
    // Normalize by length so long sentences don't win automatically.
    return { index, score: score / Math.sqrt(words.length) };
  });

  const top = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .sort((a, b) => a.index - b.index)
    .map((s) => sentences[s.index]);

  let summary = top.join(" ");
  if (summary.length > 700) summary = `${summary.slice(0, 697)}…`;
  return summary;
}

// --- provider ------------------------------------------------------------------------

export const localProvider: AiProvider = {
  name: "local-rules (prototype)",

  async analyze(text: string): Promise<AnalysisResult> {
    const t = text.trim();

    if (t.length === 0) {
      throw new Error("Empty text");
    }

    const lowerText = t.toLowerCase();

    const category = classifyDocument(t);
    const keywords = extractKeywords(t);

    // Security threat detection
    const threatSignals: string[] = [];

    if (
      lowerText.includes("credential") ||
      lowerText.includes("password") ||
      lowerText.includes("token") ||
      lowerText.includes("authentication")
    ) {
      threatSignals.push("Credential Abuse / Account Compromise");
    }

    if (
      lowerText.includes("bulk export") ||
      lowerText.includes("data export") ||
      lowerText.includes("exfiltration")
    ) {
      threatSignals.push("Possible Data Exfiltration");
    }

    if (
      lowerText.includes("mfa") ||
      lowerText.includes("multi-factor") ||
      lowerText.includes("authentication challenge")
    ) {
      threatSignals.push("Authentication Security Event");
    }

    if (
      lowerText.includes("anomalous") ||
      lowerText.includes("suspicious") ||
      lowerText.includes("unauthorized")
    ) {
      threatSignals.push("Suspicious Activity");
    }

   const uniqueThreats = [...new Set(threatSignals)];

const threatType =
  uniqueThreats.length > 0
    ? uniqueThreats[0]
    : "No specific threat detected";
    let riskScore = 0;

    if (lowerText.includes("credential")) riskScore += 25;
    if (lowerText.includes("anomalous")) riskScore += 15;
    if (lowerText.includes("suspicious")) riskScore += 15;
    if (lowerText.includes("bulk export")) riskScore += 25;
    if (lowerText.includes("exfiltration")) riskScore += 30;
    if (lowerText.includes("mfa")) riskScore += 10;
    if (lowerText.includes("ignored")) riskScore += 10;
    if (lowerText.includes("unauthorized")) riskScore += 25;
    if (lowerText.includes("credential rotated")) riskScore += 5;

    riskScore = Math.min(riskScore, 100);

    let riskLevel: AnalysisResult["riskLevel"];

    if (riskScore >= 80) {
      riskLevel = "CRITICAL";
    } else if (riskScore >= 55) {
      riskLevel = "HIGH";
    } else if (riskScore >= 30) {
      riskLevel = "MEDIUM";
    } else {
      riskLevel = "LOW";
    }

    // Prototype confidence
    const signalCount = threatSignals.length;

    const confidence = Math.min(
      95,
      60 + signalCount * 8 + (riskScore >= 70 ? 10 : 0),
    );

    // Key findings
    const keyFindings: string[] = [];

    const lines = t
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      const l = line.toLowerCase();

      if (
        l.includes("anomalous") ||
        l.includes("suspicious") ||
        l.includes("unauthorized") ||
        l.includes("bulk export") ||
        l.includes("exfiltration") ||
        l.includes("mfa") ||
        l.includes("credential")
      ) {
        keyFindings.push(line);
      }
    }

    const uniqueFindings = [...new Set(keyFindings)].slice(0, 5);

    if (uniqueFindings.length === 0) {
      uniqueFindings.push(
        "No high-confidence security indicators were identified by the prototype rules.",
      );
    }

    // Timeline extraction
    const timeline: { time: string; event: string }[] = [];

    for (const line of lines) {
      const match = line.match(/^(\d{1,2}:\d{2})\s+(.+)$/);

      if (match) {
        timeline.push({
          time: match[1],
          event: match[2],
        });
      }
    }

    // Recommended actions
    const recommendedActions: string[] = [];

    if (
      lowerText.includes("credential") ||
      lowerText.includes("password") ||
      lowerText.includes("token")
    ) {
      recommendedActions.push(
        "Investigate the affected credentials and authentication activity.",
      );
    }

    if (
      lowerText.includes("bulk export") ||
      lowerText.includes("exfiltration")
    ) {
      recommendedActions.push(
        "Review export and API logs for possible unauthorized data access.",
      );
    }

    if (lowerText.includes("mfa")) {
      recommendedActions.push(
        "Review MFA events and verify whether the authentication challenge was legitimate.",
      );
    }

    recommendedActions.push(
      "Preserve relevant gateway, authentication and application logs as evidence.",
    );

    recommendedActions.push(
      "Check for related activity involving other accounts, sessions or credentials.",
    );

    // Professional summary
    let summary = summarizeDocument(t);

    if (riskLevel === "HIGH" || riskLevel === "CRITICAL") {
      summary =
        `The document contains indicators of potentially significant security activity. ` +
        `Detected threat type: ${threatType}. ` +
        `Risk level: ${riskLevel}. ` +
        summary;
    }

    return {
      category,
      summary,
      keywords,

      riskLevel,
      threatType,
      confidence,

      keyFindings: uniqueFindings,
detectedThreats: uniqueThreats,
timeline,
recommendedActions,
      providerLabel: "Prototype Analysis (local rules)",
    };
  },
};