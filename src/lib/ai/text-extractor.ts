// ---------------------------------------------------------------------------
// Text extraction for supported document formats.
//
//   PDF   → pdf-parse
//   DOCX  → mammoth (reads the document.xml inside the OOXML package)
//   TXT   → safe UTF-8 read (with a hard character cap)
//   other (XLSX, images, ...) → not extractable in this prototype.
//            Image OCR is a documented future enhancement — the AI module
//            will not pretend to understand those files.
//
// The caller passes ALREADY-DECRYPTED plaintext (see the analysis pipeline)
// and is responsible for clearing it after use. Nothing here ever writes to
// disk, logs content, or touches the network.
// ---------------------------------------------------------------------------

import mammoth from "mammoth";
import { createRequire } from "node:module";

// pdf-parse 1.x bundles pdf.js 1.10, which CANNOT be initialized by the
// server bundler: it throws during module evaluation inside the bundle
// (it works perfectly under plain Node). So the PDF parser is loaded at
// RUNTIME through Node's own CJS loader, which bypasses the bundler entirely.
// (The package root is avoided because it enters a "debug mode" when it
// believes it is the entry module.)
const nodeRequire = createRequire(import.meta.url);

const pdf: (data: Buffer) => Promise<{ text: string; numpages: number }> = nodeRequire(
  "pdf-parse/lib/pdf-parse.js",
);

// Hard cap so a pathological file cannot blow up memory or the analysis.
const MAX_TEXT_CHARS = 200_000;

export interface ExtractedText {
  extractable: boolean;
  text: string;
  chars: number;
}

function truncate(text: string): string {
  return text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text;
}

async function parsePdf(plain: Buffer): Promise<ExtractedText> {
  const result = await pdf(plain);
  const text = truncate((result.text ?? "").replace(/\s+/g, " ").trim());
  return { extractable: text.length > 0, text, chars: text.length };
}

export async function extractText(
  plain: Buffer,
  mimeType: string,
  fileName: string,
): Promise<ExtractedText> {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();

  // --- PDF (pdf-parse 1.x, loaded at runtime — see note at top of file) ----
  if (mimeType === "application/pdf" || ext === "pdf") {
    // pdf.js 1.10 (bundled with pdf-parse 1.x) has a worker-init race: in
    // this runtime the FIRST parse call in a process fails with a spurious
    // "bad XRef entry" while later calls succeed (measured: 6/6 first-call
    // failures, success on retry after ~300 ms). The retry ladder below is
    // the documented workaround; a genuinely corrupt file fails all three
    // attempts and the pipeline records a safe failure.
    try {
      return await parsePdf(plain);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
      try {
        return await parsePdf(plain);
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return await parsePdf(plain);
      }
    }
  }

  // --- DOCX ------------------------------------------------------------------
  if (mimeType.includes("wordprocessingml") || ext === "docx") {
    const result = await mammoth.extractRawText({ buffer: plain });
    const text = truncate((result.value ?? "").replace(/\s+/g, " ").trim());
    return { extractable: text.length > 0, text, chars: text.length };
  }

  // --- Plain text formats ------------------------------------------------------
  if (mimeType.startsWith("text/") || ext === "txt" || ext === "md" || ext === "csv" || ext === "log") {
    const text = truncate(plain.toString("utf8").replace(/\s+/g, " ").trim());
    return { extractable: text.length > 0, text, chars: text.length };
  }

  // --- Everything else (XLSX, images, ...) — no extraction in this prototype --
  return { extractable: false, text: "", chars: 0 };
}

/** Formats the extractor can actually read (used for auto-analysis on upload). */
export function isExtractableFormat(mimeType: string, fileName: string): boolean {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  if (mimeType === "application/pdf" || ext === "pdf") return true;
  if (mimeType.includes("wordprocessingml") || ext === "docx") return true;
  if (mimeType.startsWith("text/") || ["txt", "md", "csv", "log"].includes(ext)) return true;
  return false;
}
