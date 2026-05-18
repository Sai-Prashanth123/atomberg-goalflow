import type { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { writeAudit } from "../lib/audit.js";

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(8),
  role: z.enum(["EMPLOYEE", "MANAGER", "ADMIN"]),
  department: z.string().min(2),
  managerId: z.string().nullable().optional(),
});

const patchUserSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(["EMPLOYEE", "MANAGER", "ADMIN"]).optional(),
  department: z.string().min(2).optional(),
  managerId: z.string().nullable().optional(),
});

export async function usersRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.authenticate }, async () => {
    const users = await app.prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, department: true, managerId: true, avatar: true },
      orderBy: { name: "asc" },
    });
    return { users };
  });

  app.get("/team", { preHandler: app.authenticate }, async (req) => {
    const team = await app.prisma.user.findMany({
      where: { managerId: req.user.sub },
      select: { id: true, email: true, name: true, role: true, department: true, avatar: true },
    });
    return { team };
  });

  app.get("/hierarchy", { preHandler: app.authenticate }, async () => {
    const users = await app.prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, department: true, managerId: true },
      orderBy: { role: "asc" },
    });
    return { users };
  });

  app.get("/:id", { preHandler: app.authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = await app.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true, department: true, managerId: true, avatar: true },
    });
    if (!user) return reply.code(404).send({ error: "Not found" });
    return { user };
  });

  // BRD §3 — Admin onboards users
  app.post("/", { preHandler: app.requireRole(["ADMIN"]) }, async (req, reply) => {
    const parse = createUserSchema.safeParse(req.body);
    if (!parse.success) return reply.code(400).send({ error: parse.error.flatten() });

    const existing = await app.prisma.user.findUnique({ where: { email: parse.data.email } });
    if (existing) return reply.code(409).send({ error: "Email already in use" });

    if (parse.data.managerId) {
      const mgr = await app.prisma.user.findUnique({ where: { id: parse.data.managerId } });
      if (!mgr) return reply.code(400).send({ error: "Manager not found" });
    }

    const passwordHash = await bcrypt.hash(parse.data.password, 8);
    const user = await app.prisma.user.create({
      data: {
        email: parse.data.email,
        name: parse.data.name,
        passwordHash,
        role: parse.data.role,
        department: parse.data.department,
        managerId: parse.data.managerId ?? null,
      },
      select: { id: true, email: true, name: true, role: true, department: true, managerId: true },
    });

    await writeAudit(app.prisma, req.user, {
      action: "Created User",
      entityType: "USER",
      entityId: user.id,
      entityLabel: user.name,
      newValue: `${user.role} · ${user.department}`,
      triggeredBy: "Admin Action",
    });

    return { user };
  });

  app.patch("/:id", { preHandler: app.requireRole(["ADMIN"]) }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parse = patchUserSchema.safeParse(req.body);
    if (!parse.success) return reply.code(400).send({ error: parse.error.flatten() });

    const before = await app.prisma.user.findUnique({ where: { id } });
    if (!before) return reply.code(404).send({ error: "Not found" });

    if (parse.data.managerId && parse.data.managerId !== before.managerId) {
      if (parse.data.managerId === id) return reply.code(400).send({ error: "User cannot manage themselves" });
      const mgr = await app.prisma.user.findUnique({ where: { id: parse.data.managerId } });
      if (!mgr) return reply.code(400).send({ error: "Manager not found" });
    }

    const user = await app.prisma.user.update({
      where: { id },
      data: parse.data,
      select: { id: true, email: true, name: true, role: true, department: true, managerId: true },
    });

    await writeAudit(app.prisma, req.user, {
      action: "Updated User",
      entityType: "USER",
      entityId: id,
      entityLabel: user.name,
      previousValue: JSON.stringify({ role: before.role, department: before.department, managerId: before.managerId }),
      newValue: JSON.stringify({ role: user.role, department: user.department, managerId: user.managerId }),
      triggeredBy: "Admin Action",
    });

    return { user };
  });

  // BRD §5.1 — Entra ID sync trigger.
  //
  // Per-user sync runs automatically on every SSO login (see `/auth/sso/microsoft` —
  // reads AD groups from the ID-token claim + calls Graph `/me/manager` for the
  // reporting line). This admin-triggered endpoint surfaces the state of that
  // process: how many users are still missing a manager, and audits the trigger
  // so HR can prove they prodded the sync at appraisal-time.
  //
  // Bulk pull via service-principal client-credentials is out of hackathon scope
  // — it requires Graph permissions `User.Read.All` + `Directory.Read.All` with
  // admin consent. The current endpoint reports honestly what's missing.
  app.post("/sync-hierarchy", { preHandler: app.requireRole(["ADMIN"]) }, async (req) => {
    const all = await app.prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, managerId: true },
      orderBy: { name: "asc" },
    });
    const missing = all.filter((u) => u.role !== "ADMIN" && !u.managerId);
    await writeAudit(app.prisma, req.user, {
      action: "Triggered Entra ID Sync",
      entityType: "USER",
      entityLabel: `${all.length} users · ${missing.length} missing manager`,
      newValue: missing.length
        ? `Will resolve at next SSO login for ${missing.map((m) => m.email).join(", ")}`
        : "All users have a manager linked",
      triggeredBy: "Admin Action",
    });
    return {
      ok: true,
      note:
        "Hierarchy + role sync runs on every SSO login. Users without a manager will be linked when they next sign in via Microsoft. Bulk service-principal sync is post-hackathon work.",
      total: all.length,
      withManager: all.length - missing.length,
      missing,
    };
  });
}
