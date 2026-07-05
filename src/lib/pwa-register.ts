/**
 * Guarded service-worker registration for Valtis.
 *
 * The service worker only registers in the production, top-level, non-preview
 * context. It never registers in Lovable preview, iframe embeds, dev builds,
 * or when the URL carries `?sw=off`. In any refused context, previously
 * registered `/sw.js` workers are unregistered to guarantee a clean slate.
 */

const SW_URL = "/sw.js";

function currentHostname(): string {
  if (typeof window === "undefined") return "";
  return window.location.hostname;
}

function isPreviewHost(hostname: string): boolean {
  return (
    hostname.startsWith("id-preview--") ||
    hostname.startsWith("preview--") ||
    hostname === "lovableproject.com" ||
    hostname.endsWith(".lovableproject.com") ||
    hostname === "lovableproject-dev.com" ||
    hostname.endsWith(".lovableproject-dev.com") ||
    hostname === "beta.lovable.dev" ||
    hostname.endsWith(".beta.lovable.dev")
  );
}

function isInsideIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

async function unregisterMatching(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(
      registrations
        .filter((reg) => {
          const url = reg.active?.scriptURL ?? reg.installing?.scriptURL ?? reg.waiting?.scriptURL ?? "";
          return url.endsWith(SW_URL);
        })
        .map((reg) => reg.unregister()),
    );
  } catch {
    /* silent */
  }
}

export function registerPWA(): void {
  if (typeof window === "undefined") return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD) {
    void unregisterMatching();
    return;
  }
  const url = new URL(window.location.href);
  if (url.searchParams.get("sw") === "off") {
    void unregisterMatching();
    return;
  }
  const hostname = currentHostname();
  if (isPreviewHost(hostname) || isInsideIframe()) {
    void unregisterMatching();
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(SW_URL, { scope: "/" })
      .catch(() => {
        /* swallow — offline mode is best-effort */
      });
  });
}