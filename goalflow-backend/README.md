# GoalFlow API

Atomberg in-house goal setting & tracking portal — backend.

## Stack

- **Fastify 5** + TypeScript
- **Prisma 6** ORM + **SQLite** (zero-infra demo, migrates to Postgres for prod)
- **@fastify/jwt** for auth (httpOnly cookies)
- **Zod** for runtime validation
- **node-cron** for the escalation engine
- **exceljs** + **csv-stringify** for report exports
- **nodemailer** for email notifications
- **@fastify/swagger** for OpenAPI docs at `/docs`

## Setup

```bash
cd goalflow-backend
npm install
cp .env.example .env
npx prisma migrate dev --name init
npx prisma db seed
npm run dev
```

API will be live at `http://localhost:3001` with OpenAPI docs at `/docs`.

## Demo credentials (after seed)

| Role     | Email                | Password    |
|----------|----------------------|-------------|
| Employee | aarav@atomberg.com   | password123 |
| Manager  | priya@atomberg.com   | password123 |
| Admin    | rohan@atomberg.com   | password123 |

## Architecture notes

- **Audit trail** — every mutation that touches a locked goal writes an `AuditEntry` with `postLock=true`, satisfying BRD §4.
- **Cycle window enforcement** — check-in mutations validate against the active cycle's `openDate`/`closeDate`.
- **Shared goals** — one PRIMARY goal owns the actuals; CLONES inherit on update via service-layer sync. Clones can only adjust weightage; title/target are read-only.
- **UoM scoring** — `direction` field on goals distinguishes Min (higher-is-better, `actual/target`) from Max (lower-is-better, `target/actual`) per BRD §2.2.
- **Escalation engine** — `node-cron` ticks hourly, evaluates `EscalationRule` records, creates `EscalationEvent` + `Notification` records, and bumps escalation level (Manager → Skip-level → HR) based on configured thresholds.
