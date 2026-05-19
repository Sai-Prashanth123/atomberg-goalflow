# Judges' Login Guide — GoalFlow

A single page with everything needed to evaluate the submission end-to-end.

---

## Quick start

1. Open the deployed URL (or `http://localhost:8081` if running locally).
2. You'll land on `/login` — a clean sign-in form (no demo shortcuts visible by design).
3. Use any of the three credentials below. **Each role has its own unique password.**
4. After signing in you're routed to that role's dashboard automatically.

---

## Demo accounts (3 roles, 1 account per role)

> Each account uses a **unique strong password**. Copy carefully — passwords are case-sensitive and include the `#` and `!` symbols.

| Role | Email | Password | What you'll see |
|---|---|---|---|
| **Admin** | `rohan@atomberg.com` | `Atomberg#Govern!2026X9` | `/admin/cycles` landing. Full access to: hierarchy, audit trail (with **post-lock toggle**), shared-goal push, escalation rules CRUD, department-filterable analytics, CSV/XLSX export. |
| **Manager** | `priya@atomberg.com` | `Atomberg#Review!2026K4` | `/manager/dashboard` landing. Approval queue, team check-in module, inline-edit on pending goals, L1 escalation visibility. |
| **Employee** | `aarav@atomberg.com` | `Atomberg#Goalset!2026P7` | `/employee/dashboard` landing. Goal sheet, weightage validation (must equal 100% to submit, min 10% per goal, max 8 goals), quarterly check-in form, return-with-reason flow. |

**Hierarchy** the seed wires up: Rohan (Admin) → Priya (Manager, Engineering) → Aarav (Employee, Engineering). The L1 → L2 → L3 escalation chain follows this tree.

---

## Microsoft Entra ID single sign-on (BRD §5.1)

Below the password field, the login screen offers **Sign in with Microsoft**. This uses a real Azure AD app registration via Supabase Auth's Azure provider.

What happens when you click it:

1. You're redirected to Microsoft's consent screen.
2. Sign in with any Microsoft account (personal `@outlook.com` works in this demo, since the app is configured for multi-tenant + personal accounts).
3. On first sign-in you're auto-provisioned as a new **EMPLOYEE** in the "Unassigned" department. The audit log captures the event as "Synced from Entra ID".
4. An admin (`rohan@atomberg.com`) can then promote you via `/admin/hierarchy` — set role to MANAGER or ADMIN, assign a manager link. Refresh, and you see the new UI immediately.

This flow demonstrates BRD §5.1's "single sign-on" + "auto org hierarchy sync" + "role assignment from AD group membership" in one ~30-second sequence.

> **Skip-if-needed:** the password accounts cover every BRD feature without SSO. SSO is only required if you want to verify the §5.1 real-integration claim.

---

## Suggested testing order (10 minutes total)

If you have time for a full pass, follow `docs/DEMO-SCRIPT.md`. If you only have 10 minutes, this is the recommended sequence:

| Minute | Sign in as | What to verify |
|---|---|---|
| 0 – 2 | `rohan@atomberg.com` (Admin) | `/admin/escalations` (rules CRUD + L1/L2/L3 events), `/analytics` (click Engineering chip — all 4 cards re-filter), `/admin/audit` (toggle post-lock filter) |
| 2 – 4 | `priya@atomberg.com` (Manager) | `/manager/approvals` — open Aarav's TAT goal, inline-edit weight, approve. Confirm the goal flips to APPROVED + LOCKED in his view. |
| 4 – 6 | `aarav@atomberg.com` (Employee) | `/employee/goals` (locked goals, returned-with-reason in red, shared clone), `/employee/check-in` (edit a Q1 actual, save, score recomputes) |
| 6 – 7 | Any role | Click the bell icon — verify real notifications (read + unread mix) |
| 7 – 10 | (Optional) | Test SSO: click "Sign in with Microsoft" with a personal account → auto-provisioned as Employee in "Unassigned" → Rohan promotes via `/admin/hierarchy` |

---

## What runs where

| Layer | Stack | Notes |
|---|---|---|
| Frontend | TanStack Start + React 19 + Tailwind | Port `8081` (or the deployed Cloudflare Pages URL) |
| Backend | Fastify 5 + Prisma 6 | Port `3001` exposed only for `/docs` (OpenAPI/Swagger). All app traffic flows through the Vite dev server's `/api` proxy — over the internal Docker network DNS, not host loopback. |
| Database | Supabase Postgres | Pre-seeded with the demo data described above. |
| Email | Resend | Real transactional sends on goal submit / approve / return. |
| Teams | Incoming webhook | Real adaptive cards. Optional — falls back to console logging if no webhook configured. |
| Escalation | `node-cron` inside backend container | Hourly tick + manual "Run Now" button on `/admin/escalations`. |

---

## If something looks off

| Symptom | Likely cause / fix |
|---|---|
| "Invalid credentials" on every account | The Supabase database has been wiped. Ask the team to run `docker compose exec backend npm run prisma:seed` (or `npm run prisma:seed` locally) — it reproduces this exact state in ~3 seconds. |
| Microsoft SSO shows `AADSTS50020` | Personal Microsoft accounts hitting a single-tenant Azure app. The hackathon submission is configured for `common` (multi-tenant + personal) so this shouldn't happen in the demo; if it does, fall back to password login. |
| `/analytics` shows "Nothing to analyse yet" | DB is empty. See first row above. |
| Page reload logs me out | Should not happen; the JWT is restored from cookie on `/auth/me`. If it does, hard-refresh once. |

---

## Source + further reading

- Repo: <https://github.com/Sai-Prashanth123/atomberg-goalflow>
- BRD requirement-to-file mapping: [`docs/BRD-compliance.md`](BRD-compliance.md)
- Live demo script (5-min walkthrough): [`docs/DEMO-SCRIPT.md`](DEMO-SCRIPT.md)
- Architecture diagram: [`docs/architecture.md`](architecture.md)
- Azure SSO setup: [`docs/SETUP-AZURE-SSO.md`](SETUP-AZURE-SSO.md)

Thanks for evaluating — the team's available for any deeper questions.
