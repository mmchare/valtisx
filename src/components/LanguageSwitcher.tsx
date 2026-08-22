import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const language = i18n.resolvedLanguage === "en" ? "en" : "fr";

  async function toggleLanguage() {
    await i18n.changeLanguage(language === "fr" ? "en" : "fr");
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={toggleLanguage}
      aria-label={t("changer_de_langue")}
      title={t("changer_de_langue")}
      className="gap-2"
    >
      <Languages className="h-4 w-4" aria-hidden="true" />
      {language === "fr" ? "EN" : "FR"}
    </Button>
  );
}
