import { useTranslation } from "react-i18next";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const toggleLanguage = () => {
    const next = i18n.language === "fr" ? "en" : "fr";
    i18n.changeLanguage(next);
  };

  return (
    <button onClick={toggleLanguage} aria-label="Changer de langue / Change language">
      {i18n.language === "fr" ? "EN" : "FR"}
    </button>
  );
}
