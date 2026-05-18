# BRD Compliance Matrix

Every BRD requirement mapped to the file(s) that implement it. Use this to verify coverage during evaluation.

## §2.1 — Phase 1: Goal Creation & Approval

| Requirement | Status | Implementation |
|---|---|---|
| Employee creates Goal Sheet — thrust area, title/description | ✅ | `goalflow-backend/src/routes/goals.routes.ts:56-87` (POST `/goals`), `goalflow-atomberg-hub/src/components/goal-bits.tsx` (modal) |
| UoM: Numeric, %, Timeline, Zero-based | ✅ | `goalflow-backend/prisma/schema.prisma` (`UoM` enum), `goalflow-atomberg-hub/src/api/types.ts:7` |
| Targets and Weightage per goal | ✅ | `goals.routes.ts:62-66` (POST schema) |
| **Weightage must equal 100%** | ✅ | `goals.routes.ts:167-171` (POST `/goals/submit` rejects ≠ 100) |
| **Minimum weightage 10% per goal** | ✅ | `goals.routes.ts:170` (rejects < 10) + frontend modal validation |
| **Maximum 8 goals per employee** | ✅ | `goals.routes.ts:62` (rejects > 8) |
| Manager L1 approval — review, inline edit, return | ✅ | `goals.routes.ts:207-278` (`/:id/approve`, `/:id/return`, PATCH `/:id`) + `manager.team.$employeeId.tsx` (UI) |
| **Lock on approval — no further edits** | ✅ | `goals.routes.ts:218` (`locked: true`), `goals.routes.ts:118` (PATCH rejects locked unless admin) |
| **Admin unlock capability** | ✅ | `goals.routes.ts:282-300` (POST `/:id/unlock`) + `manager.team.$employeeId.tsx` (admin Unlock button) |
| Shared Goals — admin/manager pushes to multiple recipients | ✅ | `goalflow-backend/src/routes/shared-goals.routes.ts` (POST `/shared-goals`) + `admin.shared-goals.tsx` |
| **Recipients adjust weightage only (title/target read-only)** | ✅ | `goals.routes.ts:111-117` (clone PATCH rejects non-weightage fields) |
| **Achievement syncs from primary to clones** | ✅ | `goals.routes.ts:339-348` (PATCH `/:id/quarter/:q` writes to all clones if primary) |

## §2.2 — Phase 2: Achievement Tracking & Check-ins

| Requirement | Status | Implementation |
|---|---|---|
| Quarterly update interface — Actual vs Planned | ✅ | `goals.routes.ts:302-362` (PATCH `/:id/quarter/:q`) + `employee.check-in.tsx` |
| Status per goal: Not Started / On Track / Completed | ✅ | `prisma/schema.prisma` (`GoalStatus` enum) |
| **Min UoM** (Numeric/%): higher-is-better → Actual ÷ Target | ✅ | `goalflow-backend/src/lib/score.ts:32` |
| **Max UoM** (Numeric/%): lower-is-better → Target ÷ Actual | ✅ | `lib/score.ts:32` (direction === "MAX" branch) |
| **Timeline UoM**: completion vs deadline | ✅ | `lib/score.ts:24-29` |
| **Zero-based UoM**: 0 = 100%, else 0% | ✅ | `lib/score.ts:20-22` |
| Manager check-in module — Planned vs Achievement per member | ✅ | `manager.team.$employeeId.tsx` (Planned-vs-Actual table) |
| Structured check-in comment | ✅ | `QuarterUpdate.note` field + UI input |

## §2.3 — Check-in Schedule

| Window | Status | Notes |
|---|---|---|
| Goal Setting (May) | ✅ | `Cycle` model `kind: GOAL_SETTING` |
| Q1 Check-in (Jul) | ✅ | `kind: Q1` |
| Q2 Check-in (Oct) | ✅ | `kind: Q2` |
| Q3 Check-in (Jan) | ✅ | `kind: Q3` |
| Q4 / Annual (Mar/Apr) | ✅ | `kind: Q4` |
| **Window enforcement — entries rejected outside active cycle** | ✅ | `lib/cycle.ts` (`isWithinCycle`) + `goals.routes.ts:323-327` |

## §3 — User Roles & Personas

| Role | Capabilities | Status |
|---|---|---|
| Employee | Draft goals, submit, log actuals, view locked goals | ✅ All routes under `/employee/*` |
| Manager L1 | Team dashboard, inline approval edit, check-in notes | ✅ All routes under `/manager/*` |
| Admin / HR | Cycle CRUD, hierarchy, audit, reports, unlock, escalations, user CRUD | ✅ All routes under `/admin/*` |
| **Role-based route gating** | ✅ | `beforeLoad` on every route checks `useStore.getState().currentUser.role` |

## §4 — Reporting & Governance

| Requirement | Status | Implementation |
|---|---|---|
| **Achievement Report — CSV / Excel** | ✅ | `goalflow-backend/src/routes/reports.routes.ts` (`/reports/achievement.csv`, `/reports/achievement.xlsx`) via `lib/csv.ts` |
| Completion Dashboard | ✅ | `/reports/completion` + `admin.reports.tsx` heatmap |
| **Audit Trail — all post-lock changes** | ✅ | `lib/audit.ts` + `AuditEntry.postLock` field. Every mutation (PATCH goal, approve, return, unlock, quarter update) calls `writeAudit()`. Audit-log filter `postLock=true` on `admin.audit.tsx`. |

## §5 — Good-to-Have Features (all implemented)

### §5.1 — Microsoft Entra ID

| Requirement | Status | Implementation |
|---|---|---|
| **Single Sign-On via Entra ID** | ✅ | `auth.routes.ts /sso/microsoft` accepts Supabase access tokens (Azure provider) — verified working end-to-end with real Azure tenant. See [`SETUP-AZURE-SSO.md`](SETUP-AZURE-SSO.md). |
| Auto org hierarchy sync — manager linkage from AD attrs | ✅ | At every SSO login the backend calls Microsoft Graph `/me/manager` via the user's delegated `provider_token` (`lib/ms-graph.ts`) and links the GoalFlow `User.managerId` to the local user matching that email. Audited as "Synced from Entra ID". |
| Role assignment from AD group membership | ✅ | At every SSO login the backend reads the `groups` claim from the Azure ID token (`user_metadata.groups`) and maps it via `lib/entra-role-mapping.ts` to ADMIN / MANAGER / EMPLOYEE using the `ENTRA_GROUP_ADMIN` / `ENTRA_GROUP_MANAGER` env vars. Falls back gracefully if claim not configured. |

### §5.2 — Email & Teams Integration

| Requirement | Status | Implementation |
|---|---|---|
| **Real transactional email** on submit / approve / return | ✅ | `lib/email.ts` Resend branch with XSS-escaped templates: `goalSubmittedHtml`, `goalApprovedHtml`, `goalReturnedHtml`. Falls back to SMTP, then console. |
| **Check-in reminder email + Teams card** broadcast when a quarterly cycle opens | ✅ | `services/cycle-transitions.service.ts` `broadcastCheckinReminder()` fans out to every employee with an APPROVED goal as soon as a Q1-Q4 cycle auto-transitions to ACTIVE. Uses `checkinReminderHtml` template + Teams card. Per-recipient error isolation; audited as "Sent Check-in Reminders". |
| Teams cards on submit / approve / return | ✅ | `lib/teams.ts` with FactSet + contextual color bar (`kind: approval/return/submit/escalation`). Falls back to console if no webhook. |
| **Manager Teams + in-app notification on quarter update** (BRD "submits OR updates") | ✅ | `goals.routes.ts` PATCH `/quarter/:q` posts to the owner's manager after every successful upsert (skips when no manager, or actor IS the manager). Message carries goal title + actual + computed score. Email intentionally omitted to avoid inbox spam. |
| Deep-link from card to goal sheet | ✅ | `notify()` builds `${APP_URL}/path` (with `APP_URL` normalized to strip trailing slash) and includes as `Action.OpenUrl` on every card |

### §5.3 — Escalation Module

| Requirement | Status | Implementation |
|---|---|---|
| **Rule-based escalations** | ✅ | `services/escalation.service.ts` + `EscalationRule` model |
| Triggers: not submitted, approval not done, check-in not completed | ✅ | `EscalationTrigger` enum (3 values) |
| **Escalation chain — Employee → Manager → Skip-level → HR** | ✅ | `escalation.service.ts:108-146` — levels 1/2/3 with bump intervals + admin fallback |
| **Escalation notifications — email + Teams + in-app fan-out** | ✅ | `escalation.service.ts:165-188` invokes `notify()` with `escalationHtml` template + `teamsCardKind: "escalation"` red color bar + deep-link to `/admin/escalations` |
| Escalation log visible to Admin / HR | ✅ | `admin.escalations.tsx` events table with timestamps and levels |
| **Configurable rules CRUD (Admin)** | ✅ | `admin.escalations.tsx` — Add Rule dialog, per-row Edit / Delete / Toggle Enabled. Backed by `POST/PATCH/DELETE /escalation/rules` (admin-only, audited). |
| Hourly cron tick + dedupe contract | ✅ | `escalation.service.ts:26` (`cron.schedule("5 * * * *", ...)`) with explicit dedupe comment (`:108-115`) — only bumps level on the next threshold band; resolving an event restarts at L1 |
| Manual tick trigger | ✅ | POST `/escalation/tick` + "Run Now" button on admin page |

### §5.4 — Analytics Module

| Requirement | Status | Implementation |
|---|---|---|
| **Quarter-on-Quarter trends — individual, team, dept** | ✅ | `/analytics/qoq` + `analytics.tsx` (Recharts line chart) with `?department` + `?userId` filters |
| Heatmaps / progress charts | ✅ | `/analytics/heatmap` + `admin.reports.tsx` + analytics page. 0% cells render as transparent dashed outlines for legibility. |
| Goal distribution — Thrust Area, UoM, status | ✅ | `/analytics/distribution` + pie chart + bar chart |
| **Manager effectiveness dashboard** | ✅ | `/analytics/manager-effectiveness` — computed from real data (approval rate + check-in rate) |
| **Department drill-down across all four analytics endpoints** | ✅ | `/qoq`, `/distribution`, `/manager-effectiveness`, `/heatmap` all accept `?department=` (`analytics.routes.ts`). Frontend `/analytics` page exposes a department chip strip (derived from `useUsers()`) that re-queries all four. |

## §6 — Evaluation Parameters

| Parameter | How we score |
|---|---|
| Functionality | All BRD flows reachable from UI for all 3 roles |
| BRD adherence | This matrix — every requirement has a file ref ✓ |
| User friendliness | Light premium theme, gold accent matches Atomberg brand. Skeletons, error boundaries, toasts, debounced inputs. |
| Bug-free | Type-checked end-to-end. Zero TS errors on both projects. Cycle window enforcement, lock enforcement, weightage validation all enforced server-side. |
| Bonus features | All 4 §5 features wired with real integrations (not mocks): Entra SSO, Resend email, Teams cards, escalation engine, real analytics. |
| Cost optimization | Free tiers throughout: Supabase, Cloudflare Pages, Fly.io free machine, Resend free 3000/mo. ~$0/month for hackathon traffic. |

## §7 — Constraints

| Constraint | Status |
|---|---|
| Web browser only | ✅ (Vite SSR React) |
| Version-controlled | ✅ Git monorepo |
| Architecture diagram | ✅ [`architecture.md`](architecture.md) (Mermaid) + `architecture.png` |
| Working demo with one full journey per role | ✅ Three demo accounts seeded |

## §8 — Submission Deliverables

| Deliverable | Location |
|---|---|
| Hosted demo URL | Deferred per submission notes — runs locally on `http://localhost:8081` |
| Source code repository | `/Atomberg` monorepo |
| Architecture diagram | [`docs/architecture.md`](architecture.md) + `docs/architecture.png` |
| Demo credentials | [Top of README](../README.md#demo-credentials) |
