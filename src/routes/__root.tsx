import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { registerPWA } from "@/lib/pwa-register";
import { Toaster } from "@/components/ui/sonner";
import { PWAInstallPrompt } from "@/components/valtis/pwa-install-prompt";
import "@fontsource/inter-tight/400.css";
import "@fontsource/inter-tight/500.css";
import "@fontsource/inter-tight/600.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "../i18n/config";
import i18n from "i18next";
import { useTranslation } from "react-i18next";

function NotFoundComponent() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{t("page_not_found")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("the_page_youre_looking_for")}</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("go_home")}
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

  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("this_page_didnt_load")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("something_went_wrong_on_our")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("try_again")}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {t("go_home")}
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
  // SSR-safe language selection:
  // - server side: use the i18n instance language (initialized in ../i18n/config)
  // - client side: prefer the hook-backed language so client changes are reflected
  const { i18n: i18nHook } = useTranslation();
  const lang =
    typeof window === "undefined"
      ? i18n.language ?? "fr"
      : i18nHook?.language ?? i18n.language ?? "fr";

  return (
    <html lang={lang}>
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

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    registerPWA();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster />
      <PWAInstallPrompt />
    </QueryClientProvider>
  );
}
