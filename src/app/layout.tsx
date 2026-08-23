import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gel Öz | Türkiye ve İtalya'dan ABD'ye Lojistik",
  description: "Mobilya ve ev ürünleri için EXW alım, navlun karşılaştırması, konsolidasyon, gümrük koordinasyonu, eve teslim ve takip.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
