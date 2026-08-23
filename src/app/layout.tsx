import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gel Öz | Türkiye & Italy to USA logistics",
  description: "EXW freight estimates, supplier-backed quotes, consolidation, customs coordination, delivery, and tracking.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
