import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Logpilot — Logbook Magang",
  description: "Dashboard lokal untuk meninjau logbook magang sebelum dikirim.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" data-theme="logpilot">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
