import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Super Agência IA 360 — Carousel Generator",
  description: "Create stunning Instagram carousels with AI-powered backgrounds and programmatic text rendering.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
