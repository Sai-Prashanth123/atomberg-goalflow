# GoalFlow — 5-Minute Demo Script

A walkthrough timed for the judges' eval window. Lands on the curated seed state (so every BRD feature is visible without typing), then performs **one live action per role** to prove the create/update/approve flows actually work.

## Pre-flight (60 sec, before judges arrive)

```powershell
cd D:\Atomberg
docker compose up -d
# wait ~10s for both containers to be healthy
```

Open **three** browser windows side-by-side (or three incognito tabs):

| Tab | URL | Sign-in |
|---|---|---|
| 1 — Admin | http://localhost:8081/login | `rohan@atomberg.com` / `password123` |
| 2 — Manager | http://localhost:8081/login | `priya@atomberg.com` / `password123` |
| 3 — Employee | http://localhost:8081/login | `aarav@atomberg.com` / `password123` |

Land each tab on the role's main dashboard before judges arrive. **Refresh the page** in each tab right before they walk in so animations replay clean.

---

## The 5-minute script

### 0:00 – 0:15 — Opening (15 sec)

> "GoalFlow is Atomberg's in-house goal-setting and tracking portal. Phase 1 + Phase 2 of the BRD plus all four §5 bonus features wired with real integrations — Microsoft Entra SSO, Resend email, Teams adaptive cards, an hourly escalation engine, and live analytics. Three roles. Let me show you."

### 0:15 – 1:45 — Admin journey (90 sec)

**Switch to Tab 1 — Rohan (Admin).**

| Time | Action | Say |
|---|---|---|
| 0:15 | `/admin/cycles` | "Indian fiscal calendar baked in. Five cycles — Q1 is open right now, Goal Setting just closed. Status auto-transitions via a daily cron." |
| 0:30 | `/admin/hierarchy` | "Rohan → two managers → four employees across Engineering and Sales. This tree drives the L1 → L2 → L3 escalation chain. It also auto-syncs from Microsoft Graph's `/me/manager` on every SSO login." |
| 0:45 | `/admin/escalations` | "Four rules, one PAUSED. Four real events on the right — L1, L1, L2, and an L3 that's already resolved. The escalation cron runs hourly inside the backend container." |
| 1:00 | **🔴 LIVE — Click `+ Add Rule`** → name `Demo Rule`, trigger `APPROVAL_PENDING`, threshold `6`, enabled → Save | "Audited, fan-out via email + Teams + in-app. Rules are fully configurable from this UI." |
| 1:20 | `/analytics` → click **Engineering** chip | "QoQ trends, distribution pie, manager effectiveness, and a completion heatmap. Every chart supports department drill-down — this is what BRD §5.4 asks for at individual / team / department levels." |
| 1:35 | `/admin/audit` → toggle **Post-lock only** | "Two post-lock entries. Admin unlocked one of Aarav's goals; manager then edited the target. Both rows captured. Governance is automatic." |

### 1:45 – 3:00 — Manager journey (75 sec)

**Switch to Tab 2 — Priya (Manager, Engineering).**

| Time | Action | Say |
|---|---|---|
| 1:45 | `/manager/dashboard` | "Priya manages three engineers. Notice the bell — two L1 escalations targeting her, including one for Aarav's pending goal she hasn't reviewed in six days." |
| 2:00 | `/manager/approvals` | "One row pending. The 5-day Approval-stale rule already fired — that L1 event we saw on the admin page came from this." |
| 2:15 | **🔴 LIVE — Open the pending goal** → inline-edit weight from 20 → 18 → click **Approve** | "Toast confirms. Goal flips to APPROVED + LOCKED. Audit trail captures the weight change. Aarav now gets an email via Resend, a Teams card, and an in-app notification." |
| 2:40 | `/manager/team/usr_aarav` | "Planned-vs-Actual for Aarav's Q1. Four actuals filled, two empty. Scores computed live from the BRD's four formulas — Min, Max, Timeline, Zero-based. The 'Zero P0 incidents' goal at 0 reads as COMPLETED, the TIMELINE goal at 35 of 90 days reads as ON_TRACK." |

### 3:00 – 4:15 — Employee journey (75 sec)

**Switch to Tab 3 — Aarav (Employee).**

| Time | Action | Say |
|---|---|---|
| 3:00 | `/employee/dashboard` | "Aarav's pie shows 100% weight allocated. Less than 100, the system refuses to let him submit. More than eight goals — same. Min 10% each. All from the BRD." |
| 3:15 | `/employee/goals` | "Locked goals carry the 🔒 icon. The returned one shows Priya's reason in red — 'right-size to 2 cities first.' He can revise and resubmit." |
| 3:30 | **🔴 LIVE — `/employee/check-in`** → edit Q1 NPS actual from 68 → 70 → Save | "Toast. The check-in is bounded by the cycle window — same edit attempted in Q2 right now would be rejected server-side." |
| 3:55 | Click bell icon | "Five notifications. The unread one at top is the goal return. Email + Teams + in-app fan out on every state change." |

### 4:15 – 4:45 — §5 bonus sweep (30 sec)

Stay in any tab.

> "Three quick callouts on the §5 bonus work:
>
> **§5.1 — SSO.** Real Azure AD app registration, multi-tenant + personal Microsoft accounts. On every login the backend pulls the user's manager from Microsoft Graph and maps Azure AD group membership to a GoalFlow role. Skipping the consent dance for time — the `docs/SETUP-AZURE-SSO.md` walks through it.
>
> **§5.2 — Integrations.** Resend for transactional email with XSS-escaped templates, Microsoft Teams incoming webhook with adaptive cards. Every notification has a deep-link back into the app.
>
> **§5.3 — Escalation.** Hourly cron, real chain with admin fallback, dedupe contract so the same rule+target doesn't double-fire within a window. You saw the events earlier — those are actual records, not seeded mocks."

### 4:45 – 5:00 — Closing (15 sec)

> "Everything runs in two Docker containers from a single image — `docker compose up`, no other setup. The seed reproduces this exact state with `npm run prisma:seed`. Fastify + Prisma + Supabase on the backend, TanStack Start + React on the frontend. Zero-cost hosting target on Fly.io + Cloudflare Pages. Source at github.com/Sai-Prashanth123/atomberg-goalflow. Happy to dig into any layer."

---

## What this script actually does

| Beat | Time | BRD coverage | Live proof |
|---|---|---|---|
| Opening | 0:15 | Positioning only | — |
| Admin journey | 1:30 | §2.3 cycles, §3 roles, §4 audit, §5.3 escalation, §5.4 analytics | Create new escalation rule |
| Manager journey | 1:15 | §2.1 approval + lock, §2.2 scoring formulas, §4 audit, §5.2 fan-out | Inline-edit + approve a pending goal |
| Employee journey | 1:15 | §2.1 all 4 states + shared clone, §2.2 quarter update, §2.3 window guard, §5.2 notifications | Save a Q1 check-in, score recomputes |
| §5 sweep | 0:30 | §5.1 + §5.2 + §5.3 + §5.4 callouts | — |
| Closing | 0:15 | Ops + stack story | — |
| **Total** | **5:00** | **§2.1 → §5.4 in one window** | **3 live actions** |

The three live actions are the "we built this, not mocked it" proofs. They flip real state in the seeded DB and produce visible side-effects (toast, badge change, audit row, score recompute) that judges can verify on screen.

---

## Backup answers for likely judge questions

| Question | One-line answer |
|---|---|
| Did you build this in 3 days? | "Yes — Phase 1 first, then Phase 2 + the four §5 bonuses." |
| Why Fastify over Express? | "Built-in JSON schema validation, faster, smaller surface, first-class Zod compat." |
| Why TanStack Start? | "SSR + file-based routing + type-safe loaders. No Vercel lock-in — runs on Cloudflare Pages." |
| How do you handle 1000 employees? | "Supabase + PgBouncer pool. Escalation tick is O(rules × stale-targets) — one Postgres query even at 10k users." |
| What if SSO is unavailable? | "Email + password fallback always works. SSO is opt-in." |
| How do you prevent race conditions on check-ins? | "Prisma upsert on (goalId, quarter). One row per quarter per goal. Lock state flips at the DB layer." |
| Is the escalation cron reliable in serverless? | "It's not in serverless — it's a long-running Node process inside a Docker container on Fly.io. That's deliberate." |
| Where are the secrets? | "`.env` (gitignored) for local dev; docker-compose for containerized runs. Production would inject via Fly.io secrets or Cloudflare Pages env vars." |
| Did you write the UI from scratch? | "Custom design system (Bento, GoldButton, Eyebrow, Chip primitives) on Tailwind. Radix primitives for the modal/drawer mechanics. Atomberg gold accent." |

---

## If you only have 2 minutes (lightning version)

Skip the explainers. Sequence:

1. (0:00 – 0:30) Admin → /admin/escalations → +Add Rule → save
2. (0:30 – 1:00) Manager → /manager/approvals → approve a goal
3. (1:00 – 1:30) Employee → /employee/check-in → save a Q1 actual
4. (1:30 – 2:00) /analytics → click Engineering chip → all cards re-filter

Three live actions + the dept-filter cherry on top. Hits §2.1, §2.2, §5.3, §5.4 in 2 minutes.

---

## If something breaks mid-demo

| Symptom | Quick fix |
|---|---|
| Container down | `docker compose restart backend` (or `frontend`) — 5 sec recovery |
| State got messy from clicks | `docker compose exec backend npm run prisma:seed` — back to curated state in ~3 sec |
| Need a fresh demo window | Open a new incognito, paste the URL, click a demo-role chip — instant reset |

Keep this doc on a second monitor or printed copy during the actual demo.
