import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import en from "./locales/en.json";
import es from "./locales/es.json";
import de from "./locales/de.json";
import fr from "./locales/fr.json";

const deviceLang = Localization.getLocales()[0]?.languageCode ?? "en";
const supportedLangs = ["en", "es", "de", "fr"];
const lng = supportedLangs.includes(deviceLang) ? deviceLang : "en";

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
    },
    interpolation: { escapeValue: false },
  });

export default i18n;
