// ─── Production SSR adapter ──────────────────────────────────────────────────
// Bridges Node's http server to the Fetch-API handler that TanStack Start
// emits in dist/server/server.js. Serves static files from dist/client/* with
// long-lived cache headers, falls through to SSR for everything else.
//
// Zero external deps — Node 22 built-ins only (http, fs, path, stream/web).
// Run: PORT=8081 node server.node.mjs
//
// Why this exists: TanStack Start's build produces a `{ fetch(req, env, ctx) }`
// handler shape (Cloudflare Worker style) even with cloudflare:false. To run
// it under Node on Azure App Service we adapt the IncomingMessage <-> Request
// boundary here. Production-grade (streaming bodies, proper status/headers).

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.join(__dirname, "dist", "client");
const SERVER_ENTRY = path.join(__dirname, "dist", "server", "server.js");
const PORT = parseInt(process.env.PORT || "8081", 10);
const HOST = process.env.HOST || "0.0.0.0";
// Backend API target — `/api/*` is proxied here with the /api prefix stripped,
// mirroring what vite.config.ts did in dev. Same-origin from the browser's POV.
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

// MIME map covers everything Vite emits + common assets
const MIME = {
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

// Lazy-load the SSR fetch handler so we don't block the listen() call
let handlerPromise;
function getHandler() {
  if (!handlerPromise) {
    handlerPromise = import(pathToFileURL(SERVER_ENTRY).href).then((m) => m.default ?? m);
  }
  return handlerPromise;
}

function safeStaticPath(urlPath) {
  // Strip query string + decode + normalise; reject any "../" traversal.
  const clean = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  const abs = path.join(CLIENT_DIR, clean);
  if (!abs.startsWith(CLIENT_DIR)) return null;
  try {
    const stat = fs.statSync(abs);
    if (stat.isFile()) return abs;
  } catch {
    /* file doesn't exist — fall through to SSR */
  }
  return null;
}

async function nodeToFetchRequest(req) {
  const url = `http://${req.headers.host || "localhost"}${req.url}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v == null) continue;
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else headers.set(k, v);
  }
  const init = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = Readable.toWeb(req);
    init.duplex = "half";
  }
  return new Request(url, init);
}

async function writeFetchResponse(response, res) {
  res.statusCode = response.status;
  response.headers.forEach((v, k) => {
    if (k.toLowerCase() === "content-encoding") return; // node will handle if we ever add compression
    res.setHeader(k, v);
  });
  if (response.body) {
    Readable.fromWeb(response.body).pipe(res);
  } else {
    res.end();
  }
}

async function proxyToBackend(req, res) {
  const targetUrl = `${BACKEND_URL}${req.url.replace(/^\/api/, "") || "/"}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v == null) continue;
    // Drop hop-by-hop headers that http(s).request will set itself
    if (/^(host|connection|content-length|transfer-encoding)$/i.test(k)) continue;
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else headers.set(k, v);
  }
  const init = { method: req.method, headers, redirect: "manual" };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = Readable.toWeb(req);
    init.duplex = "half";
  }
  const upstream = await fetch(targetUrl, init);
  res.statusCode = upstream.status;
  upstream.headers.forEach((v, k) => {
    if (k.toLowerCase() === "content-encoding") return;
    res.setHeader(k, v);
  });
  if (upstream.body) {
    Readable.fromWeb(upstream.body).pipe(res);
  } else {
    res.end();
  }
}

const server = http.createServer(async (req, res) => {
  try {
    // 1. API proxy — forward /api/* to the backend with prefix stripped.
    if (req.url.startsWith("/api/") || req.url === "/api") {
      await proxyToBackend(req, res);
      return;
    }

    // 2. Static asset?
    const filePath = safeStaticPath(req.url);
    if (filePath) {
      const ext = path.extname(filePath).toLowerCase();
      res.setHeader("content-type", MIME[ext] || "application/octet-stream");
      // /assets/* gets hashed names → immutable; everything else gets short cache.
      const isHashed = req.url.startsWith("/assets/");
      res.setHeader("cache-control", isHashed ? "public, max-age=31536000, immutable" : "public, max-age=3600");
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // 2. SSR
    const handler = await getHandler();
    const request = await nodeToFetchRequest(req);
    const response = await handler.fetch(request, process.env, {});
    await writeFetchResponse(response, res);
  } catch (err) {
    console.error("[ssr-adapter]", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "text/plain; charset=utf-8");
    }
    res.end("Internal Server Error\n");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[ssr-adapter] listening on http://${HOST}:${PORT}`);
});

// Clean shutdown for docker stop / SIGTERM
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    console.log(`[ssr-adapter] ${sig} received, closing`);
    server.close(() => process.exit(0));
  });
}
