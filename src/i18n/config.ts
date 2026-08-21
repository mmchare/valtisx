import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import fr from "../locales/fr.json";
import en from "../locales/en.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: fr },
      en: { translation: en },
    },
    fallbackLng: "fr", // langue par défaut si aucune langue détectée/supportée
    supportedLngs: ["fr", "en"],
    interpolation: {
      escapeValue: false, // React échappe déjà le HTML
    },
    detection: {
      // Ordre de détection : d'abord un choix explicite de l'utilisateur (localStorage),
      // puis les headers du navigateur
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "valtis_lang",
    },
  });

export default i18n;
