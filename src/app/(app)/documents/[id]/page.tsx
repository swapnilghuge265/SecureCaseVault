import { notFound } from "next/navigation";

import { db } from "@/db";
import { documents, cases } from "@/db/schema";
import { eq } from "drizzle-orm";

import AiAnalysisCard, {
  type AnalysisView,
} from "@/components/ai-analysis-card";

import { getLatestAnalysis } from "@/lib/ai/process-document";

import { getSessionUser } from "@/lib/auth";
import { canAccessDocument } from "@/lib/visibility";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSessionUser();

  if (!session) {
    notFound();
  }

  const { id } = await params;

  const documentId = Number(id);

  if (!Number.isInteger(documentId)) {
    notFound();
  }

  const [document] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId));

  if (!document) {
    notFound();
  }

  // Check whether the logged-in user can access this document.
  // canAccessDocument expects the actual SessionUser, not the
  // complete session object.
  const hasAccess = await canAccessDocument(
    session.user,
    document,
  );

  if (!hasAccess) {
    notFound();
  }

  const [caseRecord] = await db
    .select()
    .from(cases)
    .where(eq(cases.id, document.caseId));

  const analysis = await getLatestAnalysis(document.id);

  /*
   * Convert the server-side analysis object into the format
   * expected by the client-side AI Document Intelligence card.
   *
   * Dates cannot be passed directly to a Client Component,
   * therefore processedAt is converted to an ISO string.
   */
  const analysisView: AnalysisView | null = analysis
    ? {
        status: analysis.status,
        category: analysis.category,
        summary: analysis.summary,
        keywords: analysis.keywords,

        riskLevel: analysis.riskLevel,
        threatType: analysis.threatType,
        confidence: analysis.confidence,

        keyFindings: analysis.keyFindings,
        timeline: analysis.timeline,
        recommendedActions: analysis.recommendedActions,

        provider: analysis.provider,
        error: analysis.error,
        processedAt:
          analysis.processedAt?.toISOString() ?? null,
      }
    : null;

  return (
    <div className="space-y-5">

      {/* -------------------------------------------------------------- */}
      {/* Document Header                                                */}
      {/* -------------------------------------------------------------- */}

      <div className="card p-5">
        <div className="flex flex-wrap items-start gap-4">

          <div className="mr-auto">
            <div className="flex flex-wrap items-center gap-2">

              <h1 className="font-display text-lg font-semibold">
                {document.name}
              </h1>

              <span className="rounded-md border border-line-2 bg-field px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-mut-2">
                {document.securityLevel}
              </span>

            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-mut-2">

              <span>
                Document #{document.id}
              </span>

              {caseRecord && (
                <>
                  <span>•</span>

                  <span>
                    Case {caseRecord.caseNumber}
                  </span>
                </>
              )}

            </div>
          </div>

          <a
            href={`/api/documents/${document.id}/download`}
            className="btn btn-secondary"
          >
            Download
          </a>

        </div>
      </div>


      {/* -------------------------------------------------------------- */}
      {/* AI Document Intelligence                                      */}
      {/* -------------------------------------------------------------- */}

      <AiAnalysisCard
        documentId={document.id}
        analysis={analysisView}
      />


      {/* -------------------------------------------------------------- */}
      {/* Document Preview                                               */}
      {/* -------------------------------------------------------------- */}

      <div className="card p-5">

        <div className="mb-3">

          <h2 className="font-display text-sm font-semibold">
            Preview
          </h2>

          <p className="mt-1 text-[11px] text-mut-2">
            Document content preview
          </p>

        </div>

        <div className="rounded-xl border border-line-2 bg-field p-4">

          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-mut">
            {document.content
              ? "Encrypted document content is protected at rest."
              : "No preview available."}
          </pre>

        </div>

      </div>


      {/* -------------------------------------------------------------- */}
      {/* Metadata                                                        */}
      {/* -------------------------------------------------------------- */}

      <div className="card p-5">

        <div className="mb-4">

          <h2 className="font-display text-sm font-semibold">
            Metadata
          </h2>

          <p className="mt-1 text-[11px] text-mut-2">
            Document security and storage information
          </p>

        </div>

        <div className="grid gap-4 md:grid-cols-2">

          {/* Document ID */}

          <div className="rounded-lg border border-line-2 bg-field p-3">

            <p className="text-[10px] font-bold uppercase tracking-wider text-mut-2">
              Document ID
            </p>

            <p className="mt-1 font-mono text-sm text-mut">
              #{document.id}
            </p>

          </div>


          {/* File Name */}

          <div className="rounded-lg border border-line-2 bg-field p-3">

            <p className="text-[10px] font-bold uppercase tracking-wider text-mut-2">
              File Name
            </p>

            <p className="mt-1 text-sm text-mut">
              {document.name}
            </p>

          </div>


          {/* MIME Type */}

          <div className="rounded-lg border border-line-2 bg-field p-3">

            <p className="text-[10px] font-bold uppercase tracking-wider text-mut-2">
              File Type
            </p>

            <p className="mt-1 text-sm text-mut">
              {document.mimeType}
            </p>

          </div>


          {/* File Size */}

          <div className="rounded-lg border border-line-2 bg-field p-3">

            <p className="text-[10px] font-bold uppercase tracking-wider text-mut-2">
              File Size
            </p>

            <p className="mt-1 text-sm text-mut">
              {document.sizeBytes} bytes
            </p>

          </div>


          {/* Case */}

          <div className="rounded-lg border border-line-2 bg-field p-3">

            <p className="text-[10px] font-bold uppercase tracking-wider text-mut-2">
              Case
            </p>

            <p className="mt-1 text-sm font-semibold text-mut">
              {caseRecord?.caseNumber ??
                `Case #${document.caseId}`}
            </p>

          </div>


          {/* Classification */}

          <div className="rounded-lg border border-line-2 bg-field p-3">

            <p className="text-[10px] font-bold uppercase tracking-wider text-mut-2">
              Classification
            </p>

            <p className="mt-1 text-sm font-semibold text-mut">
              {document.securityLevel}
            </p>

          </div>

        </div>

      </div>


      {/* -------------------------------------------------------------- */}
      {/* Security Information                                           */}
      {/* -------------------------------------------------------------- */}

      <div className="card p-5">

        <div className="mb-4">

          <h2 className="font-display text-sm font-semibold">
            Security
          </h2>

          <p className="mt-1 text-[11px] text-mut-2">
            Protection and integrity information
          </p>

        </div>

        <div className="space-y-3">

          {/* Storage */}

          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line-2 bg-field p-3">

            <span className="text-sm font-semibold text-mut">
              Storage
            </span>

            <span className="ml-auto rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-300">
              ENCRYPTED AT REST
            </span>

          </div>


          {/* Encryption */}

          <div className="rounded-lg border border-line-2 bg-field p-3">

            <p className="text-[10px] font-bold uppercase tracking-wider text-mut-2">
              Encryption
            </p>

            <p className="mt-1 text-sm text-mut">
              AES-256-GCM
            </p>

          </div>


          {/* SHA-256 */}

          {document.sha256Hash && (
            <div className="rounded-lg border border-line-2 bg-field p-3">

              <p className="text-[10px] font-bold uppercase tracking-wider text-mut-2">
                SHA-256 Integrity Hash
              </p>

              <code className="mt-2 block break-all font-mono text-[11px] leading-relaxed text-cyan-200/90">
                {document.sha256Hash}
              </code>

              <p className="mt-2 text-[11px] leading-relaxed text-mut-2">
                This cryptographic fingerprint helps verify
                that the stored document has not been altered.
                It provides integrity protection and is
                different from encryption, which protects
                confidentiality.
              </p>

            </div>
          )}

        </div>

      </div>

    </div>
  );
}