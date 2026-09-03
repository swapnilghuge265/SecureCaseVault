// ---------------------------------------------------------------------------
// Small formatting + display helpers shared across pages.
// Pure functions only — no database access here.
// ---------------------------------------------------------------------------

// Human friendly file size: 1536 -> "1.5 KB"
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDateTime(d: Date | string): string {
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

// Compact relative time: "just now", "12m ago", "3h ago", "5d ago"
export function timeAgo(d: Date | string): string {
  const seconds = (Date.now() - new Date(d).getTime()) / 1000;
  if (seconds < 60) return "just now";
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.floor(minutes)}m ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = hours / 24;
  if (days < 7) return `${Math.floor(days)}d ago`;
  return formatDate(d);
}

// "Avery Stone" -> "AS" (for avatar initials)
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

// Start of the current local day — used for the "uploaded today" stat.
export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Display metadata: labels + badge tones for every enum-like field.
// Tones map to the Badge component in src/components/ui.tsx.
// ---------------------------------------------------------------------------

export type Tone = "slate" | "cyan" | "blue" | "amber" | "emerald" | "rose" | "violet";

export const ROLE_META: Record<string, { label: string; tone: Tone }> = {
  administrator: { label: "Administrator", tone: "cyan" },
  investigator: { label: "Investigator", tone: "blue" },
  legal_officer: { label: "Legal Officer", tone: "violet" },
  viewer: { label: "Viewer", tone: "slate" },
};

// Case lifecycle: Open → Under Investigation → Pending → Closed (Archived
// is a post-closure storage state).
export const CASE_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  open: { label: "Open", tone: "blue" },
  investigating: { label: "Under Investigation", tone: "amber" },
  pending: { label: "Pending", tone: "violet" },
  closed: { label: "Closed", tone: "emerald" },
  archived: { label: "Archived", tone: "slate" },
};

export const PRIORITY_META: Record<string, { label: string; tone: Tone }> = {
  low: { label: "Low", tone: "slate" },
  medium: { label: "Medium", tone: "blue" },
  high: { label: "High", tone: "amber" },
  critical: { label: "Critical", tone: "rose" },
};

export const SECURITY_META: Record<string, { label: string; tone: Tone }> = {
  confidential: { label: "Confidential", tone: "cyan" },
  secret: { label: "Secret", tone: "amber" },
  top_secret: { label: "Top Secret", tone: "rose" },
};

export const SEVERITY_META: Record<string, { label: string; tone: Tone }> = {
  low: { label: "Low", tone: "slate" },
  medium: { label: "Medium", tone: "blue" },
  high: { label: "High", tone: "amber" },
  critical: { label: "Critical", tone: "rose" },
};

// Alert lifecycle: New → Investigating → Resolved
export const ALERT_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  new: { label: "New", tone: "rose" },
  investigating: { label: "Investigating", tone: "amber" },
  resolved: { label: "Resolved", tone: "emerald" },
};

// AI analysis lifecycle: PENDING → PROCESSING → COMPLETED / FAILED
export const AI_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Pending", tone: "cyan" },
  processing: { label: "Processing", tone: "amber" },
  completed: { label: "Completed", tone: "emerald" },
  failed: { label: "Failed", tone: "rose" },
};

export const CASE_CATEGORIES = [
  "Cyber Crime",
  "Fraud",
  "Data Breach",
  "IP Dispute",
  "Compliance",
  "Other",
];

// Human labels for audit log actions.
export const ACTION_LABELS: Record<string, string> = {
  login: "Signed in",
  login_failed: "Failed sign-in",
  logout: "Signed out",
  register: "Account created",
  case_create: "Case created",
  case_update: "Case updated",
  case_delete: "Case deleted",
  document_upload: "Document uploaded",
  document_download: "Document downloaded",
  document_view: "Document viewed",
  document_delete: "Document deleted",
  document_share: "Document shared",
  document_unshare: "Share removed",
  document_access_denied: "Unauthorized document access",
  permission_denied: "Permission denied",
  alert_update: "Alert updated",
  alert_created: "Security alert created",
  ai_analysis_requested: "AI analysis requested",
  ai_analysis_completed: "AI analysis completed",
  ai_analysis_failed: "AI analysis failed",
  user_update: "User updated",
  user_role_change: "User role changed",
  profile_update: "Profile updated",
  password_change: "Password changed",
};

// Group audit actions for the filter chips on the Audit Logs page.
export const ACTION_GROUPS: Record<string, string[]> = {
  Authentication: ["login", "login_failed", "logout", "register"],
  Cases: ["case_create", "case_update", "case_delete"],
  Documents: ["document_upload", "document_download", "document_view", "document_delete", "document_share", "document_unshare", "document_access_denied"],
  Alerts: ["alert_update", "alert_created"],
  "AI Analysis": ["ai_analysis_requested", "ai_analysis_completed", "ai_analysis_failed"],
  Users: ["user_update", "user_role_change", "permission_denied"],
  Account: ["profile_update", "password_change"],
};
