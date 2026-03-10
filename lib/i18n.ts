import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";

import en from "./locales/en.json";
import es from "./locales/es.json";
import de from "./locales/de.json";
import fr from "./locales/fr.json";
import is from "./locales/is.json";

i18n
  .use(initReactI18next)
  .init({
    compatibilityJSON: "v3",
    resources: { en: { translation: en }, es: { translation: es }, de: { translation: de }, fr: { translation: fr }, is: { translation: is } },
    lng: (Localization.getLocales()?.[0]?.languageCode ?? "en").toLowerCase(),
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });

export default i18n;
