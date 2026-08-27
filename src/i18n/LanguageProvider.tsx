"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Language = "tr" | "en";

type LanguageContextValue = {
  language: Language;
  locale: "tr-TR" | "en-US";
  setLanguage: (language: Language) => void;
  text: (turkish: string, english: string) => string;
};

const STORAGE_KEY = "gel-oz-language";
const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children, initialLanguage = "tr" }: { children: React.ReactNode; initialLanguage?: Language }) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "tr" || saved === "en") setLanguageState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  function setLanguage(next: Language) {
    setLanguageState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    document.cookie = `${STORAGE_KEY}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    locale: language === "tr" ? "tr-TR" : "en-US",
    setLanguage,
    text: (turkish, english) => language === "tr" ? turkish : english,
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage must be used inside LanguageProvider");
  return value;
}

export function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage, text } = useLanguage();
  return <div className={`languageSwitch${compact ? " compact" : ""}`} role="group" aria-label={text("Dil seçimi", "Language selection")}>
    <button type="button" className={language === "tr" ? "active" : ""} onClick={() => setLanguage("tr")} aria-pressed={language === "tr"}>TR</button>
    <button type="button" className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")} aria-pressed={language === "en"}>EN</button>
  </div>;
}
