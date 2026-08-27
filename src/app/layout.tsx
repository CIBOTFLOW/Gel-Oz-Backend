import type { Metadata } from "next";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gel Öz | Türkiye, Italy & USA Logistics",
  description: "Türkiye ve İtalya'dan ABD'ye mobilya ve ev ürünleri için uçtan uca lojistik. End-to-end furniture and home-goods logistics to the USA.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body><LanguageProvider>{children}</LanguageProvider></body>
    </html>
  );
}
