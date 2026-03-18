import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import en from "./locales/en.json";
import es from "./locales/es.json";
import de from "./locales/de.json";
import fr from "./locales/fr.json";
import is from "./locales/is.json";
import no from "./locales/no.json";
import sv from "./locales/sv.json";
import da from "./locales/da.json";
import nl from "./locales/nl.json";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const AsyncStorage: any = (() => { try { return require("@react-native-async-storage/async-storage").default; } catch { return null; } })();

const LANG_STORAGE_KEY = "app_language_v1";

const deviceLang = Localization.getLocales()[0]?.languageCode ?? "en";
export const SUPPORTED_LANGS = ["en", "es", "de", "fr", "is", "no", "sv", "da", "nl"] as const;
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
      es: { translation: es },
      de: { translation: de },
      fr: { translation: fr },
      is: { translation: is },
      no: { translation: no },
      sv: { translation: sv },
      da: { translation: da },
      nl: { translation: nl },
    },
    interpolation: { escapeValue: false },
  });

// Restore previously saved language preference (async, after init)
AsyncStorage?.getItem(LANG_STORAGE_KEY)
  .then((saved: string | null) => {
    if (saved && (SUPPORTED_LANGS as readonly string[]).includes(saved)) {
      i18n.changeLanguage(saved);
    }
  })
  .catch(() => null);

/** Persist language choice so it survives app restarts. */
export function saveLanguage(lang: string): void {
  AsyncStorage?.setItem(LANG_STORAGE_KEY, lang).catch(() => null);
}

export default i18n;
