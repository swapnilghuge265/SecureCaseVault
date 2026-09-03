"use client";

// ---------------------------------------------------------------------------
// Client pieces for the document details page:
//  - DocumentPreview: fetches the (authorized) file as a blob and renders
//    PDF / image / text inline; everything else gets a clear "download to
//    view" state.
//  - CopyHash: monospace SHA-256 display with a copy button.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { Spinner } from "./ui";
import { IconCheck, IconDownload, IconFileText } from "./icons";

const TEXT_MIMES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/xml",
  "text/xml",
  "text/x-log",
]);

export function DocumentPreview({
  id,
  mimeType,
  name,
}: {
  id: number;
  mimeType: string;
  name: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
  let cancelled = false;
  urlRef.current = null;

  fetch(`/api/documents/${id}/preview`)
      .then(async (res) => {
        if (!res.ok) throw new Error("unavailable");
        const blob = await res.blob();
        if (mimeType === "application/pdf" || mimeType.startsWith("image/")) {
          const u = URL.createObjectURL(blob);
          urlRef.current = u;
          if (!cancelled) setUrl(u);
        } else if (TEXT_MIMES.has(mimeType)) {
          const t = await blob.text();
          if (!cancelled) setText(t.length > 40000 ? t.slice(0, 40000) + "\n… (truncated)" : t);
        }
        // other formats (docx, xlsx) → no inline preview; download instead
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [id, mimeType]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-mut">
        <Spinner /> Loading preview…
      </div>
    );
  }

  if (text !== null) {
    return (
      <pre className="max-h-[64vh] overflow-auto rounded-lg border border-line bg-[#060d1a] p-4 font-mono text-xs leading-relaxed text-slate-300">
        {text}
      </pre>
    );
  }

  if (url && mimeType === "application/pdf") {
    return (
      <iframe title={name} src={url} className="h-[68vh] w-full rounded-lg border border-line bg-white" />
    );
  }

  if (url && mimeType.startsWith("image/")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={name} className="mx-auto max-h-[62vh] rounded-lg border border-line" />
    );
  }

  // DOCX / XLSX (or anything else): no inline rendering in the browser.
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line-2 bg-field px-6 py-16 text-center">
      <IconFileText className="h-8 w-8 text-mut-2" />
      <p className="text-sm font-semibold text-mut">No inline preview for this format</p>
      <p className="max-w-sm text-xs leading-relaxed text-mut-2">
        This file type isn’t rendered in the browser. Download it to view the contents.
      </p>
      <a href={`/api/documents/${id}/download`} className="btn btn-primary">
        <IconDownload className="h-4 w-4" /> Download
      </a>
    </div>
  );
}

export function CopyHash({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable (e.g. insecure context) — no-op
    }
  }

  return (
    <div className="flex items-start gap-2">
      <code className="flex-1 break-all rounded-lg border border-line bg-[#060d1a] px-3 py-2 font-mono text-xs leading-relaxed text-cyan-200/90">
        {value}
      </code>
      <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={copy}>
        {copied && <IconCheck className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
