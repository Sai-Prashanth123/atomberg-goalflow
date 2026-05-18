import type { FastifyInstance } from "fastify";

export async function notificationsRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.authenticate }, async (req) => {
    const notifications = await app.prisma.notification.findMany({
      where: { userId: req.user.sub },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return { notifications };
  });

  app.post("/read-all", { preHandler: app.authenticate }, async (req) => {
    await app.prisma.notification.updateMany({ where: { userId: req.user.sub, read: false }, data: { read: true } });
    return { ok: true };
  });

  app.post("/:id/read", { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    await app.prisma.notification.update({ where: { id }, data: { read: true } });
    return { ok: true };
  });
}
