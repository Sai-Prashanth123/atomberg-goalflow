// Same-origin /api prefix. The frontend's web server (Vite dev or the Node SSR
// adapter in prod) proxies /api/* to the backend with the /api prefix stripped.
// Override via VITE_API_URL only if you're running the frontend cross-origin
// from the backend (rare — local dev still uses /api via vite.config.ts proxy).
const BASE_URL = (import.meta as { env?: Record<string, string> }).env?.VITE_API_URL ?? "/api";

// localStorage key for the bearer token. We also keep the HttpOnly cookie set
// by the backend — sending both makes auth survive Chrome's third-party-cookie
// blocking on cross-origin localhost (8080 → 3001).
const TOKEN_KEY = "goalflow.token";

export function setAuthToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

// Pull a human-readable message out of the various error shapes the backend
// returns. Order of preference:
//   1. Field-level Zod error (e.g. weightage: ["Minimum weightage is 10%"])
//   2. Form-level Zod error
//   3. Plain string error
//   4. HTTP status text
function extractErrorMessage(body: unknown, statusText: string): string {
  const b = body as { error?: unknown } | undefined;
  const err = b?.error;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object") {
    const e = err as { fieldErrors?: Record<string, string[] | undefined>; formErrors?: string[] };
    if (e.fieldErrors) {
      for (const [, msgs] of Object.entries(e.fieldErrors)) {
        if (Array.isArray(msgs) && msgs[0]) return msgs[0];
      }
    }
    if (Array.isArray(e.formErrors) && e.formErrors[0]) return e.formErrors[0];
  }
  return statusText;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const hasBody = init?.body != null && !isFormData;
  const token = getAuthToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      // Only declare JSON Content-Type when we actually send a JSON body.
      // Bodyless PATCH/POST requests with Content-Type: application/json make
      // Fastify try to parse an empty body and respond 400.
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      // Authorization header is the primary auth path; cookie is fallback.
      // @fastify/jwt reads Bearer first, then cookieName: "token".
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  // A 401 on a real protected request means the session is gone — broadcast so
  // AuthBoot can clear state and bounce to /login. Skip:
  //   - /auth/login (wrong password — handled inline by the form)
  //   - /auth/me (expected for anon visitors)
  //   - any 401 while the browser is already on a public auth page (the shared
  //     shell speculatively fires /notifications, /cycles/active, etc. there)
  if (res.status === 401 && !path.startsWith("/auth/")) {
    const onAuthPage =
      typeof window !== "undefined" &&
      (window.location.pathname === "/login" || window.location.pathname.startsWith("/auth/"));
    if (!onAuthPage) {
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    }
  }

  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const body = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const msg = isJson ? extractErrorMessage(body, res.statusText) : res.statusText;
    throw new ApiError(res.status, msg, body);
  }

  return body as T;
}

export async function downloadFile(path: string, filename: string) {
  const res = await fetch(`${BASE_URL}${path}`, { credentials: "include" });
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export { BASE_URL };
