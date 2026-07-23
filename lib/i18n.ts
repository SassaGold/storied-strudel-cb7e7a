import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import en from "./locales/en.json";
import is from "./locales/is.json";
import no from "./locales/no.json";
import sv from "./locales/sv.json";
import da from "./locales/da.json";
import { storage } from "./storage";

const LANG_STORAGE_KEY = "app_language_v1";

let deviceLang = "en";
try {
  deviceLang = Localization.getLocales()[0]?.languageCode ?? "en";
} catch {
  // expo-localization native module unavailable; fall back to English.
}
export const SUPPORTED_LANGS = ["en", "is", "no", "sv", "da"] as const;
export type SupportedLang = typeof SUPPORTED_LANGS[number];
const lng = (SUPPORTED_LANGS as readonly string[]).includes(deviceLang) ? deviceLang : "en";

i18n
  .use(initReactI18next)
  .init({
    compatibilityJSON: "v4",
    lng,
    fallbackLng: "en",
    resources: {
      en: { translation: en },
      is: { translation: is },
      no: { translation: no },
      sv: { translation: sv },
      da: { translation: da },
    },
    interpolation: { escapeValue: false },
  });

// Restore previously saved language preference (async, after init)
storage.getItem(LANG_STORAGE_KEY)
  .then((saved) => {
    if (saved && (SUPPORTED_LANGS as readonly string[]).includes(saved)) {
      i18n.changeLanguage(saved);
    }
  })
  .catch(() => null);

/** Persist language choice so it survives app restarts. */
export function saveLanguage(lang: string): void {
  storage.setItem(LANG_STORAGE_KEY, lang).catch(() => null);
}

export default i18n;
