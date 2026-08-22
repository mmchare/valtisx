import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode, Suspense } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { registerPWA } from "@/lib/pwa-register";
import { Toaster } from "@/components/ui/sonner";
import { PWAInstallPrompt } from "@/components/valtis/pwa-install-prompt";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslation } from "react-i18next";
import "@fontsource/inter-tight/400.css";
import "@fontsource/inter-tight/500.css";
import "@fontsource/inter-tight/600.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import i18n from "../i18n/config";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#0A0A0A" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { title: "Valtis — Banque privée nouvelle génération" },
      { name: "description", content: "Gestion de fortune, conformité bancaire et transferts haute sécurité pour le Canada et l'Europe." },
      { name: "author", content: "Valtis" },
      { property: "og:title", content: "Valtis — Banque privée nouvelle génération" },
      { property: "og:description", content: "Gestion de fortune, conformité bancaire et transferts haute sécurité pour le Canada et l'Europe." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Valtis — Banque privée nouvelle génération" },
      { name: "twitter:description", content: "Gestion de fortune, conformité bancaire et transferts haute sécurité pour le Canada et l'Europe." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/7MZQLluK7gPh7RD7gZWAWEcXD8s2/social-images/social-1781985197661-Gemini_Generated_Image_onuiqtonuiq[...]" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/7MZQLluK7gPh7RD7gZWAWEcXD8s2/social-images/social-1781985197661-Gemini_Generated_Image_onuiqtonui[...]" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "manifest",
        href: "/manifest.webmanifest",
      },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "192x192",
        href: "/icon-192x192.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "512x512",
        href: "/icon-512x512.png",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function I18nProvider({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { i18n } = useTranslation();

  useEffect(() => {
    registerPWA();
  }, []);

  useEffect(() => {
    const storedLanguage = typeof window !== "undefined" ? window.localStorage.getItem("valtis_lang") : null;
    const browserLanguage = typeof window !== "undefined" ? window.navigator.language.toLowerCase().split("-")[0] : "fr";
    const language = storedLanguage === "en" || storedLanguage === "fr"
      ? storedLanguage
      : browserLanguage === "en"
      ? "en"
      : "fr";

    const persistLanguage = (nextLanguage: string) => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("valtis_lang", nextLanguage === "en" ? "en" : "fr");
      }
    };
    
    i18n.on("languageChanged", persistLanguage);
    void i18n.changeLanguage(language);

    return () => {
      i18n.off("languageChanged", persistLanguage);
    };
  }, [i18n]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      document.documentElement.lang = i18n.resolvedLanguage === "en" ? "en" : "fr";
    }
  }, [i18n.resolvedLanguage]);

  return (
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <div className="fixed bottom-4 right-4 z-[60]">
          <LanguageSwitcher />
        </div>
        <Outlet key={i18n.resolvedLanguage} />
        <Toaster />
        <PWAInstallPrompt />
      </QueryClientProvider>
    </I18nProvider>
  );
}
