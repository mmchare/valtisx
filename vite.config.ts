// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Allow self-deploys on Vercel: the wrapper forces Cloudflare inside Lovable's
  // build, so this preset only kicks in outside Lovable (Vercel/CI). The
  // `vercel` preset emits `.vercel/output` in the standard build output format,
  // which avoids the 404 you get when Vercel tries to serve a Cloudflare worker.
  nitro: { preset: "vercel" },
});
