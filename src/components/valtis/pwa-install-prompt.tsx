import { useEffect, useState, useCallback, useRef } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISMISSED_KEY = "valtis-pwa-install-dismissed";
const INSTALLED_KEY = "valtis-pwa-installed";

/** Public API — call from anywhere in the app to re-open the install banner. */
export function requestPWAInstall(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("valtis:pwa-install-request"));
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = (e: Event) => {
      e.preventDefault();
      const evt = e as BeforeInstallPromptEvent;
      deferredRef.current = evt;
      setDeferredPrompt(evt);
      // Only auto-show once per device. The dismiss/install flag suppresses it thereafter.
      const dismissed = window.localStorage.getItem(DISMISSED_KEY);
      const installed = window.localStorage.getItem(INSTALLED_KEY);
      if (dismissed !== "1" && installed !== "1") {
        setIsVisible(true);
      }
    };

    const installed = () => {
      deferredRef.current = null;
      setDeferredPrompt(null);
      setIsVisible(false);
      window.localStorage.setItem(INSTALLED_KEY, "1");
      window.localStorage.setItem(DISMISSED_KEY, "1");
    };

    const relaunchRequest = () => {
      // Explicit user action — clear the "shown once" gate.
      window.localStorage.removeItem(DISMISSED_KEY);
      if (deferredRef.current) {
        setIsVisible(true);
      } else if (window.localStorage.getItem(INSTALLED_KEY) === "1") {
        toast.info("Valtis est déjà installé sur cet appareil.");
      } else {
        toast.info(
          "Ouvrez le menu de votre navigateur puis « Installer l'application » — ou revenez plus tard pour la proposition automatique.",
        );
      }
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installed);
    window.addEventListener("valtis:pwa-install-request", relaunchRequest);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installed);
      window.removeEventListener("valtis:pwa-install-request", relaunchRequest);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      window.localStorage.setItem(DISMISSED_KEY, "1");
      window.localStorage.setItem(INSTALLED_KEY, "1");
    }
    deferredRef.current = null;
    setDeferredPrompt(null);
    setIsVisible(false);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    window.localStorage.setItem(DISMISSED_KEY, "1");
  }, []);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] p-4 md:p-6">
      <div className="mx-auto max-w-md rounded-2xl border border-gold/30 bg-surface/95 backdrop-blur-md p-4 shadow-2xl shadow-black/60">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold/10">
            <Download className="h-5 w-5 text-gold" />
          </div>
          <div className="flex-1">
            <h3 className="font-display text-sm font-semibold text-foreground">
              Installer Valtis sur votre appareil
            </h3>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              Ajoutez Valtis à votre écran d'accueil pour un accès rapide et une expérience
              d'application native.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Button
                variant="gold"
                size="sm"
                className="h-8 text-xs px-4"
                onClick={handleInstall}
              >
                Installer
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs px-3 text-muted-foreground hover:text-foreground"
                onClick={handleDismiss}
              >
                Plus tard
              </Button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground transition"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
