import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { format, locales, messages, type Locale, type MessageKey } from "./messages";

const STORAGE_KEY = "hermes:locale";

type I18nContextValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && (locales as readonly string[]).includes(raw)) return raw as Locale;
  } catch {
    /* ignore storage errors (private mode, SSR) */
  }
  return "en";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // SSR renders "en"; useEffect below hydrates from storage on the client to
  // avoid a mismatch between server markup and client markup.
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const stored = readStoredLocale();
    if (stored !== locale) setLocaleState(stored);
  }, [locale]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore storage errors */
    }
  }, []);

  const t = useCallback<I18nContextValue["t"]>(
    (key, vars) => {
      const template = messages[locale][key] ?? messages.en[key] ?? (key as string);
      return format(template, vars);
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within an I18nProvider");
  return ctx;
}
