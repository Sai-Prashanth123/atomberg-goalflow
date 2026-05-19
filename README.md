# GoalFlow — Atomberg In-House Goal Setting & Tracking Portal

> **AtomQuest Hackathon 1.0 submission.** Production-grade web portal for the full goal lifecycle: creation → manager approval → quarterly check-ins → audit-ready reviews.

![Status](https://img.shields.io/badge/status-submission--ready-success) ![BRD](https://img.shields.io/badge/BRD-§2.1–§5.4%20complete-gold) ![Stack](https://img.shields.io/badge/stack-Fastify%20%2B%20React%20%2B%20Supabase-blue)

## What this is

A unified portal that replaces the spreadsheets, email threads, and offline review cycles Atomberg currently uses for performance management. Three roles (Employee, Manager, Admin), full BRD §2.1 + §2.2 lifecycle, audit-ready governance, and every §5 bonus wired up with real integrations: Microsoft Entra ID SSO, transactional email via Resend, Microsoft Teams adaptive cards, hourly escalation engine, and live analytics with department drill-down.

## Demo credentials

**Three role-based accounts** with unique strong passwords are pre-seeded for evaluation. The full credentials table, what each account demonstrates, and a 10-minute suggested testing order live in a single page:

➡️ **See [`docs/JUDGES-LOGIN-GUIDE.md`](docs/JUDGES-LOGIN-GUIDE.md)** for emails + passwords.

Summary:
- **Admin** (`rohan@atomberg.com`) — full governance: cycles, hierarchy, audit trail, shared goals, escalation rules CRUD, analytics with department drill-down, CSV/XLSX export
- **Manager** (`priya@atomberg.com`) — pending-approval queue, team check-in module, L1 escalation visibility
- **Employee** (`aarav@atomberg.com`) — goal lifecycle (DRAFT → PENDING → APPROVED+LOCKED → check-ins), with a RETURNED-with-reason example pre-seeded

Real Microsoft SSO is wired (multi-tenant + personal accounts). On first SSO sign-in a user is auto-provisioned as EMPLOYEE in "Unassigned" department — Admin can then promote them via `/admin/hierarchy`. See [`docs/SETUP-AZURE-SSO.md`](docs/SETUP-AZURE-SSO.md).

## Architecture

![Architecture](docs/architecture.png)

See [`docs/architecture.md`](docs/architecture.md) for the source Mermaid diagram and deployment topology.

**One-line stack:** Vite / TanStack Start + React 19 frontend → Fastify 5 + Prisma 6 API → Supabase Postgres → `node-cron` escalation engine + cycle reconciler, Resend email, Teams webhook, Azure AD (via Supabase Auth) SSO.

## How to run locally

```bash
# 1. Backend
cd goalflow-backend
npm install
cp .env.example .env          # paste Supabase DB password into DATABASE_URL + DIRECT_URL
npx prisma migrate deploy     # apply schema (or run prisma/supabase-init.sql via Supabase MCP)
npm run prisma:seed           # 7 users / 5 cycles / 14 goals / 4 escalation rules / 4 events
npm run dev                   # → http://localhost:3001  (OpenAPI docs at /docs)

# 2. Frontend (new terminal)
cd goalflow-atomberg-hub
npm install
npm run dev                   # → http://localhost:8081
```

Then visit <http://localhost:8081/login>, click a role chip, sign in.

## What the seed data covers

The slim seed is deliberately small (~minimum to demo every BRD feature in 2-3 examples) so judges can see the whole product end-to-end without scrolling:

| Concept | Count | Where it shows up |
|---|---|---|
| Approval states (all 4) | 10 APPROVED, 1 PENDING, 1 RETURNED (w/ reason), 2 DRAFT | Aarav covers all four; Vikram's 2 drafts at 50% block submit |
| UoMs (all 4) | TIMELINE, ZERO_BASED, NUMERIC, PERCENTAGE | Spread across Aarav + Neha |
| Direction (MIN + MAX) | MAX on Aarav TAT + Arjun stock-out | Lower-is-better scoring formulas |
| Shared goal | 1 primary + 3 clones | Rohan's org sustainability index |
| Q1 actuals filled | 7 of 14 | Mid-quarter progress visible in scoring + Planned-vs-Actual table |
| Escalation rules | 4 (3 enabled, 1 PAUSED) | Demos rule CRUD + toggle |
| Escalation events | 4 (L1 ×2 + L2 + L3 RESOLVED) | All three levels of the chain + resolved state |
| Notifications | 10 covering all 6 types | SUBMIT / APPROVAL / RETURN / CHECKIN_REMINDER / ESCALATION / SHARED_GOAL |
| Audit entries | 8 (2 post-lock) | Lifecycle from cycle open through Admin unlock + Manager edit |

Re-running `npm run prisma:seed` reproduces this exact state — safe to reset the demo between walkthroughs.

## BRD Coverage

See [`docs/BRD-compliance.md`](docs/BRD-compliance.md) for every BRD requirement mapped to the file that implements it. Summary:

| Section | Requirement | Status |
|---|---|---|
| §2.1 | Goal creation, validation (weightage = 100, min 10, max 8), L1 approval, lock-on-approve, admin unlock, shared goals with achievement sync | ✅ |
| §2.2 | Quarterly check-ins, status, **Min / Max / Timeline / Zero-based** scoring per BRD formulas | ✅ |
| §2.3 | Cycle window enforcement (Goal Setting → Q1 → Q2 → Q3 → Q4) | ✅ |
| §3 | Three differentiated roles with strict access control on every route | ✅ |
| §4 | Audit trail with **post-lock change flag**, CSV/Excel export, completion dashboard | ✅ |
| §5.1 | **Real Microsoft Entra ID SSO** via Supabase Auth (Azure provider) + auto org-sync from MS Graph + AD group → role mapping | ✅ |
| §5.2 | **Real email** via Resend + **real Teams adaptive cards** via incoming webhook on submit / approve / return + check-in-window broadcast | ✅ |
| §5.3 | Escalation engine — rule-based, hourly cron, L1 → L2 → L3 chain with admin fallback + email + Teams + in-app fan-out + admin CRUD UI | ✅ |
| §5.4 | Analytics — QoQ trends, thrust distribution, manager effectiveness, completion heatmap, all with **department drill-down** | ✅ |

## Repository layout

```
goalflow/                              (this repo)
├── README.md                          # this file
├── .gitignore                         # monorepo-wide ignore
├── docs/
│   ├── architecture.md                # Mermaid source diagram
│   ├── architecture.png               # exported architecture diagram
│   ├── BRD-compliance.md              # requirement → file mapping
│   ├── SETUP-AZURE-SSO.md             # Azure AD app reg walkthrough
│   └── SETUP-INTEGRATIONS.md          # Resend + Teams setup
├── goalflow-backend/                  # Fastify 5 + Prisma 6 + Supabase
│   ├── src/
│   │   ├── server.ts                  # boot, helmet, rate-limit, swagger
│   │   ├── routes/                    # auth, goals, users, cycles, escalation, analytics, reports
│   │   ├── services/                  # escalation, notification, cycle-transitions
│   │   ├── lib/                       # score, audit, email, teams, ms-graph, entra-role-mapping
│   │   └── plugins/                   # prisma, auth (JWT)
│   ├── prisma/
│   │   ├── schema.prisma              # 8 entities
│   │   └── seed.ts                    # slim curated demo data
│   └── .env.example                   # all required env vars + comments
└── goalflow-atomberg-hub/             # TanStack Start + React 19 + Tailwind
    └── src/
        ├── routes/                    # /employee, /manager, /admin, /analytics, /auth
        ├── api/                       # React Query hooks + types
        ├── components/                # Bento UI kit, goal modal, skeletons, notification bell
        └── lib/                       # store, auth-guard, supabase
```

## API documentation

OpenAPI / Swagger UI is exposed at the running backend root: **<http://localhost:3001/docs>**.

## Tech decisions (BRD criterion #6 — cost optimization)

| Layer | Choice | Why |
|---|---|---|
| Backend hosting | **Fly.io free tier** | Persistent process — keeps `node-cron` escalation alive. No sleep / cold-start. ~$0/month for hackathon load. |
| Frontend hosting | **Cloudflare Pages** | Free, global edge, already wired (`wrangler.jsonc`, `@cloudflare/vite-plugin`). |
| Database | **Supabase Postgres** (free tier) | 500 MB + 2 GB egress covers hackathon. PgBouncer pooler keeps connection count low. |
| Email | **Resend** | Free 3000/mo, no DNS setup needed (uses `resend.dev` sender). |
| Auth | **Supabase Auth** native Azure provider | Saves ~3 hrs vs hand-rolling MSAL. Free. |

## Security posture

- **JWT secret required** in production — server refuses to boot without it
- **HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy** via `@fastify/helmet`
- **Rate limiting** — 100/min global, 5/min on `/auth/*` (prod)
- **Cookies** — `httpOnly` + `sameSite: strict` (prod) + `secure: true` (prod)
- **CORS** — explicit origin allowlist, `*` blocked in prod
- **Audit trail** flags every post-lock mutation for governance review
- **bcrypt** for password hashing (cost 8)
- **Zod** validation on every request body

## License

MIT. Built for AtomQuest Hackathon 1.0.
