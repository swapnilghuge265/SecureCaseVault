// ---------------------------------------------------------------------------
// SecureCaseVault — AI document analysis pipeline
//
// Pipeline:
//
//   encrypted document bytes
//        ↓
//   controlled in-memory decryption
//        ↓
//   text extraction
//        ↓
//   AI provider / local security rules
//        ↓
//   security intelligence extraction
//        ↓
//   PostgreSQL document_analyses
//        ↓
//   plaintext buffer securely cleared
//
// AI failures never break document management.
// ---------------------------------------------------------------------------

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { documentAnalyses } from "@/db/schema";
import { decryptBuffer } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";

import {
  AiAnalysisError,
  analyzeText,
  extractText,
} from "./index";

// ---------------------------------------------------------------------------
// Actor
// ---------------------------------------------------------------------------

export interface AnalysisActor {
  id: number;
  username: string;
}

// ---------------------------------------------------------------------------
// Stored analysis
// ---------------------------------------------------------------------------

export interface StoredAnalysis {
  id: number;
  status: string;

  category: string | null;
  summary: string | null;
  keywords: string[] | null;

  riskLevel: string | null;
  threatType: string | null;
  confidence: number | null;

  keyFindings: string[] | null;
  detectedThreats: string[] | null;
  timeline: string[] | null;
  recommendedActions: string[] | null;

  provider: string | null;
  error: string | null;

  processedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Safe error handling
// ---------------------------------------------------------------------------

function safeError(err: unknown): string {
  if (err instanceof AiAnalysisError) {
    return err.message;
  }

  return "AI analysis failed unexpectedly.";
}

// ---------------------------------------------------------------------------
// Upsert latest analysis
// ---------------------------------------------------------------------------

async function upsertAnalysis(
  documentId: number,
  row: {
    status: string;

    category?: string | null;
    summary?: string | null;
    keywords?: string[] | null;

    riskLevel?: string | null;
    threatType?: string | null;
    confidence?: number | null;

    keyFindings?: string[] | null;
detectedThreats?: string[] | null;
timeline?: string[] | null;
    recommendedActions?: string[] | null;

    provider?: string | null;
    error?: string | null;
  },
): Promise<void> {
  const [existing] = await db
    .select({
      id: documentAnalyses.id,
    })
    .from(documentAnalyses)
    .where(eq(documentAnalyses.documentId, documentId));

  const values = {
    status: row.status,

    category: row.category ?? null,
    summary: row.summary ?? null,
    keywords: row.keywords ?? null,

    riskLevel: row.riskLevel ?? null,
    threatType: row.threatType ?? null,
    confidence: row.confidence ?? null,

    keyFindings: row.keyFindings ?? null,
detectedThreats: row.detectedThreats ?? null,
timeline: row.timeline ?? null,
    recommendedActions: row.recommendedActions ?? null,

    provider: row.provider ?? null,
    error: row.error ?? null,

    processedAt:
      row.status === "completed" || row.status === "failed"
        ? new Date()
        : null,
  };

  if (existing) {
    await db
      .update(documentAnalyses)
      .set(values)
      .where(eq(documentAnalyses.id, existing.id));
  } else {
    await db
      .insert(documentAnalyses)
      .values({
        documentId,
        ...values,
      });
  }
}

// ---------------------------------------------------------------------------
// Get latest analysis
// ---------------------------------------------------------------------------

export async function getLatestAnalysis(
  documentId: number,
): Promise<StoredAnalysis | null> {
  const [row] = await db
    .select()
    .from(documentAnalyses)
    .where(eq(documentAnalyses.documentId, documentId))
    .orderBy(documentAnalyses.id)
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    status: row.status,

    category: row.category,
    summary: row.summary,
    keywords: row.keywords,

    riskLevel: row.riskLevel,
    threatType: row.threatType,
    confidence: row.confidence,

    keyFindings: row.keyFindings,
detectedThreats: row.detectedThreats,
timeline: row.timeline,
    recommendedActions: row.recommendedActions,

    provider: row.provider,
    error: row.error,

    processedAt: row.processedAt,
  };
}

// ---------------------------------------------------------------------------
// Run document analysis
// ---------------------------------------------------------------------------

export async function runDocumentAnalysis(
  doc: {
    id: number;
    name: string;
    mimeType: string;
    content: Buffer;
  },

  actor: AnalysisActor,

  ip: string,
): Promise<StoredAnalysis> {
  const auditBase = {
    userId: actor.id,
    username: actor.username,
    resourceType: "document",
    resourceId: String(doc.id),
    ip,
  };

  // -------------------------------------------------------------------------
  // Audit: analysis requested
  // -------------------------------------------------------------------------

  await logAudit({
    ...auditBase,

    action: "ai_analysis_requested",

    detail: `AI analysis requested for ${doc.name}`,

    success: true,
  });

  // -------------------------------------------------------------------------
  // Mark processing
  // -------------------------------------------------------------------------

  await upsertAnalysis(doc.id, {
    status: "processing",
  });

  let plain: Buffer | null = null;

  try {
    // -----------------------------------------------------------------------
    // Decrypt document in memory
    // -----------------------------------------------------------------------

    plain = decryptBuffer(doc.content);

    // -----------------------------------------------------------------------
    // Extract text
    // -----------------------------------------------------------------------

    const extracted = await extractText(
      plain,
      doc.mimeType,
      doc.name,
    );

    if (!extracted.extractable) {
      throw new AiAnalysisError(
        "No extractable text in this file type (image OCR is a future enhancement).",
      );
    }

    if (extracted.chars < 20) {
      throw new AiAnalysisError(
        "Document contains too little text to analyze.",
      );
    }

    // -----------------------------------------------------------------------
    // Run AI analysis
    // -----------------------------------------------------------------------

    const result = await analyzeText(extracted.text);

    // -----------------------------------------------------------------------
    // Store complete AI security intelligence
    // -----------------------------------------------------------------------

    await upsertAnalysis(doc.id, {
      status: "completed",

      category: result.category,
      summary: result.summary,
      keywords: result.keywords,

      riskLevel: result.riskLevel,
      threatType: result.threatType,
      confidence: result.confidence,

      keyFindings: result.keyFindings,
      detectedThreats: result.detectedThreats,

      // Convert structured timeline objects into database-safe strings.
      timeline: result.timeline.map(
        (event) => `${event.time} — ${event.event}`,
      ),

      recommendedActions: result.recommendedActions,

      provider: result.providerLabel,

      error: null,
    });

    // -----------------------------------------------------------------------
    // Audit: analysis completed
    // -----------------------------------------------------------------------

    await logAudit({
      ...auditBase,

      action: "ai_analysis_completed",

      detail:
        `AI analysis completed for ${doc.name} ` +
        `(category: ${result.category}, risk: ${result.riskLevel})`,

      success: true,
    });

    return (await getLatestAnalysis(doc.id))!;
  } catch (err) {
    // -----------------------------------------------------------------------
    // Failure handling
    // -----------------------------------------------------------------------

    console.error("AI analysis failed", err);

    const message = safeError(err);

    await upsertAnalysis(doc.id, {
      status: "failed",

      error: message,
    });

    await logAudit({
      ...auditBase,

      action: "ai_analysis_failed",

      detail:
        `AI analysis failed for ${doc.name}: ${message}`,

      success: false,
    });

    return (await getLatestAnalysis(doc.id))!;
  } finally {
    // -----------------------------------------------------------------------
    // Clear plaintext from memory
    // -----------------------------------------------------------------------

    if (plain) {
      plain.fill(0);
    }
  }
}