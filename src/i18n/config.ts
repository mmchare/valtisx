import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import fr from "../locales/fr.json";
import en from "../locales/en.json";

i18n
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: fr },
      en: { translation: en },
    },
    fallbackLng: "fr",
    supportedLngs: ["fr", "en"],
    lowerCaseLng: true,
    cleanCode: true,
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
