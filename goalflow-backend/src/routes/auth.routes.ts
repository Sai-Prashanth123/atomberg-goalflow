import type { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getSupabase } from "../lib/supabase.js";
import { writeAudit } from "../lib/audit.js";
import { fetchManagerEmail } from "../lib/ms-graph.js";
import { mapEntraGroupsToRole } from "../lib/entra-role-mapping.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// SSO request body accepts EITHER:
//   - { accessToken: "...", providerToken?: "..." } — real Supabase Auth session
//     (Azure AD provider). `providerToken` is the underlying delegated Azure
//     access token used to call Microsoft Graph for §5.1 hierarchy + group sync.
//   - { email: "...", name? }    — demo/mock path, used when Azure isn't configured
const ssoSchema = z.union([
  z.object({ accessToken: z.string().min(20), providerToken: z.string().optional() }),
  z.object({ email: z.string().email(), name: z.string().min(1).optional() }),
]);

const isProd = process.env.NODE_ENV === "production";
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: isProd ? ("strict" as const) : ("lax" as const),
  path: "/",
  secure: isProd,
  maxAge: 60 * 60 * 24 * 7, // 7 days
};

// BRD §6 / criterion #4 — per-route rate limit on auth endpoints to deter brute-force
const authLimit = {
  config: {
    rateLimit: { max: isProd ? 5 : 50, timeWindow: "1 minute" },
  },
};

export async function authRoutes(app: FastifyInstance) {
  app.post("/login", authLimit, async (req, reply) => {
    const parse = loginSchema.safeParse(req.body);
    if (!parse.success) return reply.code(400).send({ error: parse.error.flatten() });

    const user = await app.prisma.user.findUnique({ where: { email: parse.data.email } });
    if (!user) return reply.code(401).send({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(parse.data.password, user.passwordHash);
    if (!ok) return reply.code(401).send({ error: "Invalid credentials" });

    const token = app.jwt.sign({ sub: user.id, email: user.email, role: user.role, name: user.name });
    reply.setCookie("token", token, COOKIE_OPTS);

    return {
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, department: user.department, managerId: user.managerId },
    };
  });

  // BRD §5.1 — Microsoft Entra ID SSO.
  // Real path: client posts a Supabase Auth access token (Azure provider). We verify
  // it via Supabase getUser(), map email → GoalFlow user, auto-provision if needed.
  // Fallback path: legacy { email, name } payload — preserved so demos work offline.
  app.post("/sso/microsoft", authLimit, async (req, reply) => {
    const parse = ssoSchema.safeParse(req.body);
    if (!parse.success) return reply.code(400).send({ error: parse.error.flatten() });

    let resolvedEmail: string | null = null;
    let resolvedName: string | null = null;
    let resolvedGroups: string[] = []; // §5.1 — AD group GUIDs claim
    let providerToken: string | null = null; // §5.1 — delegated Azure token for Graph
    let via: "entra-id" | "entra-id-mock" = "entra-id-mock";

    if ("accessToken" in parse.data) {
      const supabase = getSupabase();
      if (!supabase) {
        return reply.code(503).send({ error: "Supabase not configured on server" });
      }
      const { data, error } = await supabase.auth.getUser(parse.data.accessToken);
      if (error || !data.user) {
        return reply.code(401).send({ error: "Invalid Supabase token" });
      }
      const u = data.user;
      resolvedEmail = u.email ?? null;
      resolvedName =
        (u.user_metadata?.name as string | undefined) ??
        (u.user_metadata?.full_name as string | undefined) ??
        (u.user_metadata?.preferred_username as string | undefined) ??
        null;
      // BRD §5.1 — read AD groups from the ID token claim (requires `groups`
      // claim enabled in Azure app's Token configuration). Empty array if not.
      const rawGroups = u.user_metadata?.groups;
      if (Array.isArray(rawGroups)) {
        resolvedGroups = rawGroups.filter((g): g is string => typeof g === "string");
      }
      providerToken = parse.data.providerToken ?? null;
      if (!resolvedEmail) return reply.code(400).send({ error: "Token has no email claim" });
      via = "entra-id";
    } else {
      resolvedEmail = parse.data.email;
      resolvedName = parse.data.name ?? null;
    }

    let user = await app.prisma.user.findUnique({ where: { email: resolvedEmail } });
    if (!user) {
      user = await app.prisma.user.create({
        data: {
          email: resolvedEmail,
          name: resolvedName ?? resolvedEmail.split("@")[0],
          passwordHash: await bcrypt.hash(`sso-${Date.now()}`, 8),
          role: "EMPLOYEE",
          department: "Unassigned",
        },
      });
      // Audit the auto-provision so HR can trace SSO onboarding (BRD §4).
      await writeAudit(app.prisma, { sub: user.id, name: user.name }, {
        action: "User Auto-Provisioned via SSO",
        entityType: "USER",
        entityId: user.id,
        entityLabel: user.email,
        newValue: `Role: EMPLOYEE, Dept: Unassigned (via ${via})`,
        triggeredBy: "Self Update",
      });
    }

    // BRD §5.1 — Org hierarchy sync + role assignment from AD claims.
    // Runs on every SSO login so role/manager stay fresh as AD changes.
    // Graceful: missing claims/token → preserve existing values, no error.
    if (via === "entra-id") {
      const newRoleFromGroups = mapEntraGroupsToRole(resolvedGroups); // null = no groups configured
      const managerEmail = providerToken ? await fetchManagerEmail(providerToken) : null;
      const managerUser = managerEmail
        ? await app.prisma.user.findUnique({ where: { email: managerEmail } })
        : null;

      const nextRole = newRoleFromGroups ?? user.role;
      const nextManagerId = managerUser?.id ?? user.managerId; // keep existing if Graph silent

      if (nextRole !== user.role || nextManagerId !== user.managerId) {
        const before = { role: user.role, manager: user.managerId };
        user = await app.prisma.user.update({
          where: { id: user.id },
          data: { role: nextRole, managerId: nextManagerId },
        });
        await writeAudit(app.prisma, { sub: user.id, name: user.name }, {
          action: "Synced from Entra ID",
          entityType: "USER",
          entityId: user.id,
          entityLabel: user.email,
          previousValue: `Role: ${before.role}, Manager: ${before.manager ?? "—"}`,
          newValue: `Role: ${nextRole}, Manager: ${managerUser?.name ?? nextManagerId ?? "—"}`,
          triggeredBy: "Self Update",
        });
        app.log.info(
          { user: user.email, role: nextRole, manager: managerEmail, groups: resolvedGroups.length },
          "[entra-sync] user enriched",
        );
      }
    }

    const token = app.jwt.sign({ sub: user.id, email: user.email, role: user.role, name: user.name });
    reply.setCookie("token", token, COOKIE_OPTS);

    return {
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, department: user.department, managerId: user.managerId },
      via,
    };
  });

  app.get("/me", { preHandler: app.authenticate }, async (req, reply) => {
    const user = await app.prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { id: true, email: true, name: true, role: true, department: true, managerId: true, avatar: true },
    });
    if (!user) return reply.code(404).send({ error: "User not found" });
    // Re-issue a fresh JWT so the client's localStorage can be rehydrated from
    // a cookie-only session (e.g. browser blocked third-party cookies on a previous
    // request, but the cookie survived). Idempotent + cheap.
    const token = app.jwt.sign({ sub: user.id, email: user.email, role: user.role, name: user.name });
    reply.setCookie("token", token, COOKIE_OPTS);
    return { user, token };
  });

  app.post("/logout", async (_req, reply) => {
    reply.clearCookie("token", { path: "/" });
    return { ok: true };
  });
}
