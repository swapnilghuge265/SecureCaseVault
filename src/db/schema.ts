// ---------------------------------------------------------------------------
// SecureCaseVault — Database schema (Drizzle ORM / PostgreSQL)
//
// Every table the app needs lives here so the schema is easy to read in one
// place. This file is the equivalent of the `models/` folder in a classic
// Flask + SQLAlchemy project.
// ---------------------------------------------------------------------------

import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";

// PostgreSQL `bytea` (binary data) column type for stored file contents.
const bytea = customType<{
  data: Buffer;
  driverData: Buffer;
}>({
  dataType: () => "bytea",
});

// --- Users -----------------------------------------------------------------
//
// Role values (enforced in code, see src/lib/auth.ts):
//   "administrator" | "investigator" | "legal_officer" | "viewer"

export const users = pgTable("users", {
  id: serial("id").primaryKey(),

  username: text("username")
    .notNull()
    .unique(),

  email: text("email")
    .notNull()
    .unique(),

  // Passwords are stored as bcrypt hashes — never as plain text.
  passwordHash: text("password_hash").notNull(),

  fullName: text("full_name").notNull(),

  role: text("role")
    .notNull()
    .default("viewer"),

  status: text("status")
    .notNull()
    .default("active"),

  // Simple notification preferences used on the Settings page.
  notifySecurity: boolean("notify_security")
    .notNull()
    .default(true),

  notifyDigest: boolean("notify_digest")
    .notNull()
    .default(false),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
});

// --- Sessions --------------------------------------------------------------
//
// A logged-in user gets a random token stored here and in an httpOnly cookie.

export const sessions = pgTable("sessions", {
  // The session token itself is the primary key.
  id: text("id").primaryKey(),

  userId: integer("user_id")
    .notNull()
    .references(() => users.id, {
      onDelete: "cascade",
    }),

  ipAddress: text("ip_address"),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),

  expiresAt: timestamp("expires_at", {
    withTimezone: true,
  }).notNull(),
});

// --- Cases -----------------------------------------------------------------
//
// Status:
//   "open" | "investigating" | "closed" | "archived"
//
// Priority:
//   "low" | "medium" | "high" | "critical"

export const cases = pgTable("cases", {
  id: serial("id").primaryKey(),

  caseNumber: text("case_number")
    .notNull()
    .unique(),

  title: text("title").notNull(),

  description: text("description"),

  category: text("category")
    .notNull()
    .default("Cyber Crime"),

  status: text("status")
    .notNull()
    .default("open"),

  priority: text("priority")
    .notNull()
    .default("medium"),

  // The user who owns the case.
  ownerId: integer("owner_id")
    .notNull()
    .references(() => users.id),

  createdBy: integer("created_by")
    .references(() => users.id),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),

  updatedAt: timestamp("updated_at", {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
});

// --- Documents -------------------------------------------------------------
//
// File bytes are stored directly in the database (bytea) to keep the
// prototype self-contained.
//
// In a real deployment this could be replaced with object storage such as
// S3/GCS while keeping only metadata in PostgreSQL.
//
// Security levels:
//   "confidential" | "secret" | "top_secret"

export const documents = pgTable(
  "documents",
  {
    id: serial("id").primaryKey(),

    caseId: integer("case_id")
      .notNull()
      .references(() => cases.id, {
        onDelete: "cascade",
      }),

    // Display name shown in the UI.
    name: text("name").notNull(),

    // Real uploaded filename, sanitized by the file handling layer.
    originalName: text("original_name").notNull(),

    // Random storage filename.
    storageName: text("storage_name").notNull(),

    // SHA-256 fingerprint computed at upload time.
    sha256Hash: text("sha256_hash").notNull(),

    mimeType: text("mime_type").notNull(),

    sizeBytes: integer("size_bytes").notNull(),

    securityLevel: text("security_level")
      .notNull()
      .default("confidential"),

    description: text("description"),

    content: bytea("content").notNull(),

    uploadedBy: integer("uploaded_by")
      .references(() => users.id),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },

  (t) => [
    index("documents_case_idx").on(t.caseId),
  ],
);

// --- Document shares -------------------------------------------------------
//
// Explicit access grants:
// "document X is shared with user Y".
//
// This table controls document access for Viewer users.

export const documentShares = pgTable(
  "document_shares",
  {
    id: serial("id").primaryKey(),

    documentId: integer("document_id")
      .notNull()
      .references(() => documents.id, {
        onDelete: "cascade",
      }),

    userId: integer("user_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
      }),

    sharedBy: integer("shared_by")
      .references(() => users.id),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },

  (t) => [
    index("shares_doc_idx").on(t.documentId),

    index("shares_user_idx").on(t.userId),

    uniqueIndex("shares_doc_user_uniq").on(
      t.documentId,
      t.userId,
    ),
  ],
);

// --- Document AI analyses --------------------------------------------------
//
// One row per document holding the latest AI analysis.
//
// Basic fields:
//   category
//   summary
//   keywords
//
// Security intelligence:
//   riskLevel
//   threatType
//   confidence
//   keyFindings
//   timeline
//   recommendedActions
//
// Status:
//   "pending" | "processing" | "completed" | "failed"

export const documentAnalyses = pgTable(
  "document_analyses",
  {
    id: serial("id").primaryKey(),

    documentId: integer("document_id")
      .notNull()
      .references(() => documents.id, {
        onDelete: "cascade",
      }),

    status: text("status")
      .notNull()
      .default("pending"),

    // Existing AI fields.
    category: text("category"),

    summary: text("summary"),

    keywords: text("keywords").array(),

    // -----------------------------------------------------------------------
    // NEW AI SECURITY INTELLIGENCE
    // -----------------------------------------------------------------------

    // LOW | MEDIUM | HIGH | CRITICAL
    riskLevel: text("risk_level"),

    // Example:
    // "Credential Abuse / Account Compromise"
    // "Possible Data Exfiltration"
    threatType: text("threat_type"),
    detectedThreats: text("detected_threats").array(),

    // Prototype confidence score from 0-100.
    confidence: integer("confidence"),

    // Important findings extracted from the document.
    keyFindings: text("key_findings").array(),

    // Timeline events stored as text for the prototype.
    timeline: text("timeline").array(),

    // Suggested investigation actions.
    recommendedActions: text("recommended_actions").array(),

    // AI provider used for the analysis.
    provider: text("provider"),

    // Safe user-facing error message.
    error: text("error"),

    processedAt: timestamp("processed_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },

  (t) => [
    index("analyses_doc_idx").on(t.documentId),
  ],
);

// --- Audit logs -------------------------------------------------------------
//
// Append-only log of user activity.
//
// Examples:
//   login
//   login_failed
//   case.create
//   document.upload
//   document.view
//   ai_analysis_requested
//   ai_analysis_completed

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),

    userId: integer("user_id")
      .references(() => users.id),

    // Denormalized username so history remains readable.
    username: text("username"),

    action: text("action").notNull(),

    resourceType: text("resource_type"),

    resourceId: text("resource_id"),

    detail: text("detail"),

    ipAddress: text("ip_address"),

    // Client user agent.
    userAgent: text("user_agent"),

    // Whether the operation succeeded.
    success: boolean("success")
      .notNull()
      .default(true),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },

  (t) => [
    index("audit_logs_time_idx").on(t.createdAt),
  ],
);

// --- Security alerts --------------------------------------------------------
//
// Raised automatically by the rule-based monitoring system.
//
// Severity:
//   "low" | "medium" | "high" | "critical"
//
// Status:
//   "new" → "investigating" → "resolved"

export const securityAlerts = pgTable(
  "security_alerts",
  {
    id: serial("id").primaryKey(),

    // Examples:
    // "failed_logins"
    // "bulk_download"
    // "unauthorized_access"
    type: text("type").notNull(),

    severity: text("severity").notNull(),

    title: text("title").notNull(),

    message: text("message"),

    userId: integer("user_id")
      .references(() => users.id),

    ipAddress: text("ip_address"),

    // Related resource.
    resourceType: text("resource_type"),

    resourceId: text("resource_id"),

    status: text("status")
      .notNull()
      .default("new"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },

  (t) => [
    index("alerts_status_idx").on(t.status),
  ],
);
