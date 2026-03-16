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

const deviceLang = Localization.getLocales()[0]?.languageCode ?? "en";
const supportedLangs = ["en", "es", "de", "fr", "is", "no", "sv", "da"];
const lng = supportedLangs.includes(deviceLang) ? deviceLang : "en";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function nsFrom(locale: any) {
  return {
    common: locale.common,
    tabs: locale.tabs,
    language: locale.language,
    home: locale.home,
    food: locale.food,
    sleep: locale.sleep,
    explore: locale.explore,
    garage: locale.garage,
    sos: locale.sos,
    triplog: locale.triplog,
    about: locale.about,
    settings: locale.settings,
  };
}

i18n
  .use(initReactI18next)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .init({
    compatibilityJSON: "v4",
    lng,
    fallbackLng: "en",
    defaultNS: "common",
    ns: ["common", "tabs", "language", "home", "food", "sleep", "explore", "garage", "sos", "triplog", "about", "settings"],
    resources: {
      en: nsFrom(en),
      es: nsFrom(es),
      de: nsFrom(de),
      fr: nsFrom(fr),
      is: nsFrom(is),
      no: nsFrom(no),
      sv: nsFrom(sv),
      da: nsFrom(da),
    },
    interpolation: { escapeValue: false },
  } as Parameters<typeof i18n.init>[0]);

export default i18n;
