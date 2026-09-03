// Shared types for the AI provider abstraction.

export interface TimelineEvent {
  time: string;
  event: string;
}

export interface AnalysisResult {
  category: string;
  summary: string;
  keywords: string[];

  // Security intelligence
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  threatType: string;
  confidence: number;

  // Investigation findings
  keyFindings: string[];
  detectedThreats: string[];
  timeline: TimelineEvent[];
  recommendedActions: string[];

  /** Human label shown in the UI. */
  providerLabel: string;
}

export interface AiProvider {
  /** Machine name stored in the analyses table (no secrets). */
  name: string;

  analyze(text: string): Promise<AnalysisResult>;
}

/** Thrown for expected, user-explainable analysis failures. */
export class AiAnalysisError extends Error {}