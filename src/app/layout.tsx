import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource/cairo/400.css";
import "@fontsource/cairo/600.css";
import "@fontsource/cairo/800.css";
import { ScrollActivity } from "@/components/background/ScrollActivity";
import { DiagnosticsPanel } from "@/components/diagnostics/DiagnosticsPanel";
import "./globals.css";

export const metadata: Metadata = {
  title: "تشفير — مصنع التحول الرقمي",
  description: "مصنع تشفير: صف فكرتك، وشاهد منتجك الرقمي يُبنى أمامك خطوة بخطوة.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <a className="skip-link" href="#main">
          تخطَّ إلى المحتوى
        </a>
        {children}
        <ScrollActivity />
        {/* hidden unless ?diag=1: measures on this device */}
        <DiagnosticsPanel />
      </body>
    </html>
  );
}
