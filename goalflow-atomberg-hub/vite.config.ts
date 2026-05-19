// This Vite config delegates to a wrapper that already bundles common build
// plugins — do NOT add them manually or the app will break with duplicates:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// Add additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Dev-only proxy target. In docker-compose this is overridden to "http://backend:3001"
// so all API traffic flows over the internal docker network DNS instead of via
// host loopback. Outside docker the default keeps local-dev working.
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

// Vite 7 blocks unknown Host headers by default (DNS-rebinding protection).
// Deployed under Azure / behind a reverse proxy the inbound Host header is the
// public URL — so we either allow all (testing) or pass a comma-separated list
// via VITE_ALLOWED_HOSTS for production tightening.
const allowedHosts: true | string[] = process.env.VITE_ALLOWED_HOSTS
  ? process.env.VITE_ALLOWED_HOSTS.split(",").map((s) => s.trim()).filter(Boolean)
  : true;

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// `cloudflare: false` disables the Worker bundling and produces a generic Node SSR
// output so we can run with `node` on Azure App Service / docker. The wrapper
// only loads @cloudflare/vite-plugin when this flag is truthy.
export default defineConfig({
  cloudflare: false,
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    server: {
      allowedHosts,
      // /api/* requests from the browser hit the Vite dev server which proxies
      // them to the backend container via docker's internal DNS. Strip the /api
      // prefix on the way out since Fastify routes don't carry it.
      proxy: {
        "/api": {
          target: BACKEND_URL,
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api/, ""),
        },
      },
    },
  },
});
