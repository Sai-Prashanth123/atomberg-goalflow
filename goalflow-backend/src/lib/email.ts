import nodemailer from "nodemailer";

// Escape user-supplied strings before interpolating into HTML email templates.
// Defends against XSS via crafted goal titles, escalation reasons, etc.
function esc(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Escape a URL for use in href. Strips javascript: and data: schemes.
function escUrl(s: string | null | undefined): string {
  if (!s) return "";
  const trimmed = String(s).trim();
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return "";
  return esc(trimmed);
}

type SendOpts = { to: string; subject: string; html: string; text?: string };

let smtpTransporter: nodemailer.Transporter | null = null;

function getSmtpTransporter() {
  if (smtpTransporter) return smtpTransporter;
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  smtpTransporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: false,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return smtpTransporter;
}

async function sendViaResend(opts: SendOpts): Promise<{ ok: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "GoalFlow <onboarding@resend.dev>",
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body.slice(0, 200)}`);
  }
  return { ok: true };
}

function logConsole(opts: SendOpts) {
  console.log(`[email:console] → ${opts.to} | ${opts.subject}\n${opts.text ?? opts.html.replace(/<[^>]+>/g, "")}\n`);
}

export async function sendEmail(opts: SendOpts): Promise<{ ok: boolean; mode: "resend" | "smtp" | "console" }> {
  // Prefer Resend (production), fall back to SMTP, fall back to console (dev demo).
  // CRITICAL: every branch must catch its own failure and degrade to console —
  // notifications must never crash the parent mutation (goal approve/return/submit/etc.).
  if (process.env.RESEND_API_KEY) {
    try {
      await sendViaResend(opts);
      return { ok: true, mode: "resend" };
    } catch (err) {
      console.warn("[email:resend] delivery failed; falling back to console:", err instanceof Error ? err.message : err);
      logConsole(opts);
      return { ok: false, mode: "console" };
    }
  }
  const t = getSmtpTransporter();
  if (t) {
    try {
      await t.sendMail({
        from: process.env.SMTP_FROM ?? "noreply@goalflow.local",
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      });
      return { ok: true, mode: "smtp" };
    } catch (err) {
      console.warn("[email:smtp] delivery failed; falling back to console:", err instanceof Error ? err.message : err);
      logConsole(opts);
      return { ok: false, mode: "console" };
    }
  }
  logConsole(opts);
  return { ok: true, mode: "console" };
}

// ─── Templates ───────────────────────────────────────────────────────────────
// Small, inline-styled HTML — no template engine. Designed for transactional emails.

const COLORS = { gold: "#F2BB44", ink: "#0F1419", muted: "#5C6E78", line: "#BDDBE5", tint: "#F4FAFC" };

function shell(title: string, body: string) {
  // `title` is already escaped at call sites; `body` is composed of literal markup
  // built from escaped values, never raw user input.
  return `<!doctype html>
<html><body style="margin:0;background:${COLORS.tint};font-family:Roboto,system-ui,sans-serif;color:${COLORS.ink}">
  <div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid ${COLORS.line};">
    <div style="padding:24px;border-bottom:1px solid ${COLORS.line}">
      <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:${COLORS.gold};font-family:'JetBrains Mono',monospace">GoalFlow · Atomberg</div>
      <h1 style="margin:8px 0 0;font-size:22px;font-family:'Space Grotesk',sans-serif;font-weight:700">${title}</h1>
    </div>
    <div style="padding:24px;font-size:14px;line-height:1.55">${body}</div>
    <div style="padding:16px 24px;border-top:1px solid ${COLORS.line};font-size:11px;color:${COLORS.muted}">
      Atomberg in-house goal portal — automated notification. Do not reply.
    </div>
  </div>
</body></html>`;
}

export function goalSubmittedHtml(opts: { managerName: string; employeeName: string; count: number; link?: string }) {
  const link = escUrl(opts.link);
  return shell(
    "Goals submitted for your review",
    `<p>Hi ${esc(opts.managerName)},</p>
     <p><b>${esc(opts.employeeName)}</b> submitted <b>${esc(opts.count)}</b> goal${opts.count === 1 ? "" : "s"} for your approval.</p>
     ${link ? `<p><a href="${link}" style="display:inline-block;background:${COLORS.gold};color:${COLORS.ink};padding:10px 18px;font-weight:700;text-decoration:none;font-family:'Space Grotesk',sans-serif">Review goals →</a></p>` : ""}`,
  );
}

export function goalApprovedHtml(opts: { employeeName: string; goalTitle: string; link?: string }) {
  const link = escUrl(opts.link);
  return shell(
    "Your goal was approved",
    `<p>Hi ${esc(opts.employeeName)},</p>
     <p>Your manager approved the goal: <b>&ldquo;${esc(opts.goalTitle)}&rdquo;</b>. It is now locked for the cycle and will appear on your dashboard.</p>
     ${link ? `<p><a href="${link}" style="display:inline-block;border:1px solid ${COLORS.gold};color:${COLORS.gold};padding:10px 18px;font-weight:700;text-decoration:none;font-family:'Space Grotesk',sans-serif">Open in GoalFlow →</a></p>` : ""}`,
  );
}

export function goalReturnedHtml(opts: { employeeName: string; goalTitle: string; reason: string; link?: string }) {
  const link = escUrl(opts.link);
  return shell(
    "Goal returned for rework",
    `<p>Hi ${esc(opts.employeeName)},</p>
     <p>Your manager returned the goal <b>&ldquo;${esc(opts.goalTitle)}&rdquo;</b> for revisions.</p>
     <p style="background:${COLORS.tint};padding:12px;border-left:3px solid ${COLORS.gold};margin:16px 0">
       <b style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${COLORS.muted}">Reason</b><br/>
       ${esc(opts.reason)}
     </p>
     ${link ? `<p><a href="${link}" style="display:inline-block;border:1px solid ${COLORS.gold};color:${COLORS.gold};padding:10px 18px;font-weight:700;text-decoration:none;font-family:'Space Grotesk',sans-serif">Open goal →</a></p>` : ""}`,
  );
}

export function checkinReminderHtml(opts: { employeeName: string; quarterName: string; closeDate: string; link?: string }) {
  const link = escUrl(opts.link);
  return shell(
    `${esc(opts.quarterName)} check-in is open`,
    `<p>Hi ${esc(opts.employeeName)},</p>
     <p>The <b>${esc(opts.quarterName)}</b> check-in window is currently open. Please log actual achievement against each goal before <b>${esc(opts.closeDate)}</b>.</p>
     ${link ? `<p><a href="${link}" style="display:inline-block;background:${COLORS.gold};color:${COLORS.ink};padding:10px 18px;font-weight:700;text-decoration:none;font-family:'Space Grotesk',sans-serif">Complete check-in →</a></p>` : ""}`,
  );
}

export function escalationHtml(opts: { recipientName: string; level: number; targetName: string; reason: string }) {
  return shell(
    `Escalation L${esc(opts.level)} — ${esc(opts.targetName)}`,
    `<p>Hi ${esc(opts.recipientName)},</p>
     <p>An escalation has been raised regarding <b>${esc(opts.targetName)}</b>.</p>
     <p style="background:${COLORS.tint};padding:12px;border-left:3px solid ${COLORS.gold}">
       <b style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${COLORS.muted}">Reason</b><br/>${esc(opts.reason)}
     </p>`,
  );
}
