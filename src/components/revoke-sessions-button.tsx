"use client";

import { useState } from "react";

export default function RevokeSessionsButton({
  username,
}: {
  username: string;
}) {
  const [loading, setLoading] = useState(false);

  async function revokeSessions() {
    const confirmed = window.confirm(
      `Revoke all active sessions for "${username}"?`,
    );

    if (!confirmed) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/sessions/revoke-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username }),
      });

      const data = await response.json();

      if (!response.ok) {
        window.alert(data.error ?? "Failed to revoke sessions.");
        return;
      }

      window.alert(
        `${data.revokedCount} session(s) revoked for ${data.username}.`,
      );

      window.location.reload();
    } catch {
      window.alert("Something went wrong while revoking sessions.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={revokeSessions}
      disabled={loading}
      className="rounded-lg border border-red-500/30 px-3 py-2 text-xs font-medium text-red-400 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? "Revoking..." : "Revoke Sessions"}
    </button>
  );
}