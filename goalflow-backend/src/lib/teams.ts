// Microsoft Teams adaptive card notifications via incoming webhook.
// If TEAMS_WEBHOOK_URL is not configured, falls back to console logging.

type CardKind = "approval" | "return" | "submit" | "escalation" | "default";

type CardOpts = {
  title: string;
  text: string;
  link?: { label: string; url: string };
  facts?: Array<{ title: string; value: string }>;
  kind?: CardKind;
};

const KIND_COLOR: Record<CardKind, "good" | "warning" | "attention" | "accent" | "default"> = {
  approval: "good",
  return: "warning",
  submit: "accent",
  escalation: "attention",
  default: "default",
};

const KIND_EMOJI: Record<CardKind, string> = {
  approval: "✅",
  return: "↩️",
  submit: "📋",
  escalation: "⚠️",
  default: "🔔",
};

export async function sendTeamsCard(opts: CardOpts): Promise<{ ok: boolean; mode: "webhook" | "console" }> {
  const url = process.env.TEAMS_WEBHOOK_URL;
  const kind = opts.kind ?? "default";
  const color = KIND_COLOR[kind];

  const body: Array<Record<string, unknown>> = [
    {
      type: "Container",
      style: color === "default" ? undefined : color,
      bleed: true,
      items: [
        {
          type: "TextBlock",
          text: `${KIND_EMOJI[kind]} ${opts.title}`,
          weight: "Bolder",
          size: "Medium",
          wrap: true,
        },
      ],
    },
    {
      type: "TextBlock",
      text: opts.text,
      wrap: true,
      spacing: "Medium",
    },
  ];

  if (opts.facts && opts.facts.length > 0) {
    body.push({
      type: "FactSet",
      facts: opts.facts,
    });
  }

  const card = {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body,
          actions: opts.link
            ? [{ type: "Action.OpenUrl", title: opts.link.label, url: opts.link.url }]
            : [],
        },
      },
    ],
  };

  if (!url || !isValidWebhookUrl(url)) {
    if (url && !isValidWebhookUrl(url)) {
      console.warn(`[teams] TEAMS_WEBHOOK_URL is not a valid https:// URL — falling back to console.`);
    }
    console.log(`[teams:console:${kind}] ${opts.title} — ${opts.text}${opts.link ? ` | ${opts.link.url}` : ""}`);
    return { ok: true, mode: "console" };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(card),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Teams webhook ${res.status}: ${text.slice(0, 200)}`);
  }
  return { ok: true, mode: "webhook" };
}

// Teams incoming webhooks are always served over HTTPS. Reject http://, file:, etc.
// to avoid silently sending data to a corrupted env var, and reject anything that
// doesn't parse.
function isValidWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}
