import type { FastifyInstance } from "fastify";
import { authRoutes } from "./auth.routes.js";
import { goalsRoutes } from "./goals.routes.js";
import { cyclesRoutes } from "./cycles.routes.js";
import { usersRoutes } from "./users.routes.js";
import { auditRoutes } from "./audit.routes.js";
import { reportsRoutes } from "./reports.routes.js";
import { sharedGoalsRoutes } from "./shared-goals.routes.js";
import { notificationsRoutes } from "./notifications.routes.js";
import { escalationRoutes } from "./escalation.routes.js";
import { analyticsRoutes } from "./analytics.routes.js";

export async function registerRoutes(app: FastifyInstance) {
  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(usersRoutes, { prefix: "/users" });
  await app.register(cyclesRoutes, { prefix: "/cycles" });
  await app.register(goalsRoutes, { prefix: "/goals" });
  await app.register(sharedGoalsRoutes, { prefix: "/shared-goals" });
  await app.register(notificationsRoutes, { prefix: "/notifications" });
  await app.register(auditRoutes, { prefix: "/audit" });
  await app.register(reportsRoutes, { prefix: "/reports" });
  await app.register(analyticsRoutes, { prefix: "/analytics" });
  await app.register(escalationRoutes, { prefix: "/escalation" });
}
