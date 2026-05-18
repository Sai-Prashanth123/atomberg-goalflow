import type { PrismaClient, NotificationType } from "@prisma/client";
import { sendEmail } from "../lib/email.js";
import { sendTeamsCard } from "../lib/teams.js";

export type NotifyOpts = {
  userId: string;
  type: NotificationType;
  message: string;
  link?: string;
  email?: { to: string; subject: string; html?: string };
  teams?: boolean;
  teamsCardKind?: "approval" | "return" | "submit" | "escalation" | "default";
};

export async function notify(prisma: PrismaClient, opts: NotifyOpts) {
  await prisma.notification.create({
    data: {
      userId: opts.userId,
      type: opts.type,
      message: opts.message,
      link: opts.link,
    },
  });

  if (opts.email) {
    const html = opts.email.html ??
      `<p>${opts.message}</p>${opts.link ? `<p><a href="${opts.link}">Open in GoalFlow</a></p>` : ""}`;
    await sendEmail({
      to: opts.email.to,
      subject: opts.email.subject,
      html,
      text: `${opts.message}${opts.link ? `\n\n${opts.link}` : ""}`,
    }).catch((e) => console.error("[notify:email]", e));
  }

  if (opts.teams) {
    await sendTeamsCard({
      title: `GoalFlow — ${opts.type}`,
      text: opts.message,
      link: opts.link ? { label: "Open in GoalFlow", url: opts.link } : undefined,
      kind: opts.teamsCardKind ?? "default",
    }).catch((e) => console.error("[notify:teams]", e));
  }
}
