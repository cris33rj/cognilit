import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cognilit",
  description: "Plataforma de revisão sistemática assistida por IA",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
