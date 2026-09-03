import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthShell from "@/components/auth-shell";
import { LoginForm } from "@/components/auth-forms";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  // Already signed in? Straight to the dashboard.
  if (await getSessionUser()) redirect("/dashboard");

  return (
    <AuthShell>
      <LoginForm />
    </AuthShell>
  );
}
