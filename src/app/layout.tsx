import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import ThemeProvider from "@/components/theme-provider";

export const metadata: Metadata = {
  title: {
    default: "SecureCaseVault — Secure Document Management",
    template: "%s · SecureCaseVault",
  },
  description:
    "Prototype platform for managing sensitive legal and investigation documents: upload, search, audit and securely share.",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}