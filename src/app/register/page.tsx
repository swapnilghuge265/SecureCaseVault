import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthShell from "@/components/auth-shell";
import { RegisterForm } from "@/components/auth-forms";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Register" };

export default async function RegisterPage() {
  if (await getSessionUser()) redirect("/dashboard");

  return (
    <AuthShell>
      <RegisterForm />
    </AuthShell>
  );
}
