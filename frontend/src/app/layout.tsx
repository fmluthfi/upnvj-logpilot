import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Logpilot | Otomasi Logbook Magang",
  description: "Siapkan catatan logbook magang dari Google Docs untuk rentang tanggal pilihanmu.",
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
