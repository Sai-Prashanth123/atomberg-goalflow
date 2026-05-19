# Setup — Deploying GoalFlow to Azure

One-page walkthrough for deploying the GoalFlow monorepo to Azure. Uses the existing single Docker image (built from the repo's `Dockerfile`) and the already-hosted Supabase database — no schema work needed.

**Topology**

```
┌────────────────────────────────────────────────────┐
│  Azure Container Apps (or App Service for Containers) │
│                                                    │
│  ┌───────────────────┐    ┌───────────────────┐   │
│  │ goalflow-backend  │ ←→ │ goalflow-frontend │   │
│  │ Fastify, port 3001│    │ Vite SSR, port 8081│   │
│  └─────────┬─────────┘    └────────┬──────────┘   │
│            │                       │              │
└────────────┼───────────────────────┼──────────────┘
             │                       │
             ▼                       ▼
       Supabase Postgres        Browser (HTTPS)
       (already hosted)
```

Both services run from the same `goalflow:latest` image (built locally then pushed, or built by Azure from the GitHub repo). Internal communication uses Azure-managed service discovery, identical to the docker-compose `http://backend:3001` pattern locally.

---

## Prerequisites

- Azure subscription with an active resource group
- Azure CLI installed locally (`az --version` works)
- Logged in via `az login`
- The GoalFlow repo cloned at `D:\Atomberg`
- Supabase project already provisioned with the schema applied (was done during development)

---

## Steps

### 1. Push the Docker image to Azure Container Registry

```bash
# create a registry (one-time)
az acr create \
  --resource-group goalflow-rg \
  --name goalflowacr \
  --sku Basic \
  --admin-enabled true

# build + push from the repo root
cd D:\Atomberg
az acr build \
  --registry goalflowacr \
  --image goalflow:latest \
  --file Dockerfile \
  .
```

> `az acr build` uploads the build context to ACR and builds remotely — no need for a local Docker daemon.

### 2. Create the Container Apps environment

```bash
az containerapp env create \
  --resource-group goalflow-rg \
  --name goalflow-env \
  --location centralus
```

### 3. Deploy the backend container

```bash
az containerapp create \
  --resource-group goalflow-rg \
  --name goalflow-backend \
  --environment goalflow-env \
  --image goalflowacr.azurecr.io/goalflow:latest \
  --registry-server goalflowacr.azurecr.io \
  --target-port 3001 \
  --ingress external \
  --workload-profile-name Consumption \
  --min-replicas 1 \
  --max-replicas 1 \
  --command npm --args run,dev \
  --env-vars \
    DATABASE_URL="<your-supabase-pooler-url>" \
    DIRECT_URL="<your-supabase-direct-url>" \
    SUPABASE_URL="<your-supabase-project-url>" \
    SUPABASE_PUBLISHABLE_KEY="<your-supabase-publishable-key>" \
    APP_URL="<frontend-app-url-from-step-4>" \
    JWT_SECRET="<32-char-random-secret>" \
    NODE_ENV="production" \
    PORT="3001" \
    CORS_ORIGIN="<frontend-app-url-from-step-4>" \
    RESEND_API_KEY="<rotated-resend-key>" \
    EMAIL_FROM="GoalFlow <onboarding@resend.dev>"
```

> ⚠️ **`min-replicas 1`** — the escalation cron runs hourly inside the backend process. Setting min-replicas to 0 would let the container scale to zero between requests and the cron would never fire.

After the create completes, copy the **fully qualified domain** Azure prints (e.g. `goalflow-backend.kindbush-12345.centralus.azurecontainerapps.io`) — needed for the frontend env.

### 4. Deploy the frontend container

```bash
az containerapp create \
  --resource-group goalflow-rg \
  --name goalflow-frontend \
  --environment goalflow-env \
  --image goalflowacr.azurecr.io/goalflow:latest \
  --registry-server goalflowacr.azurecr.io \
  --target-port 8081 \
  --ingress external \
  --workload-profile-name Consumption \
  --command npm --args run,dev,--,--host,0.0.0.0,--port,8081 \
  --env-vars \
    VITE_API_URL="/api" \
    BACKEND_URL="https://<backend-fqdn-from-step-3>" \
    NODE_ENV="production" \
    HOST="0.0.0.0" \
    PORT="8081"
```

### 5. Backfill the cross-references

Once both containers are live, update each side with the other's URL:

```bash
# backend needs to know the frontend URL for CORS + email deep links
az containerapp update \
  --resource-group goalflow-rg \
  --name goalflow-backend \
  --set-env-vars \
    APP_URL="https://<frontend-fqdn>" \
    CORS_ORIGIN="https://<frontend-fqdn>"

# frontend's BACKEND_URL was already set in step 4; verify it points at the backend FQDN
```

### 6. Seed the database (one-time)

```bash
# Local Prisma run against the Supabase DB:
cd D:\Atomberg\goalflow-backend
npm install
npm run prisma:seed
```

Or exec into the running backend container and run it there:

```bash
az containerapp exec \
  --resource-group goalflow-rg \
  --name goalflow-backend \
  --command "npm run prisma:seed"
```

### 7. Verify

```bash
# Backend health
curl https://<backend-fqdn>/docs/   # → HTTP 200, Swagger HTML

# Frontend redirects login
curl -I https://<frontend-fqdn>/    # → HTTP 307 to /login

# End-to-end: login through the frontend's /api proxy
curl -X POST https://<frontend-fqdn>/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"rohan@atomberg.com","password":"<your-strong-password>"}'
# → HTTP 200 + JWT
```

---

## Production env-var checklist

| Variable | Required | Set to |
|---|---|---|
| `DATABASE_URL` | yes | Supabase pooler URL (port 6543) |
| `DIRECT_URL` | yes | Supabase direct URL (port 5432) — used by Prisma migrations |
| `SUPABASE_URL` | yes | `https://<project>.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | yes | Anon/publishable key from Supabase dashboard |
| `APP_URL` | **yes** | Frontend FQDN — used for deep links in emails + Teams cards |
| `CORS_ORIGIN` | **yes** | Frontend FQDN — comma-separated if multiple |
| `JWT_SECRET` | **yes** | 32+ char random secret. Server refuses to boot in prod without this. |
| `NODE_ENV` | yes | `production` |
| `PORT` | yes | `3001` (backend) or `8081` (frontend) |
| `RESEND_API_KEY` | optional | Resend API key. If unset, email falls back to console log. |
| `EMAIL_FROM` | optional | Defaults to `GoalFlow <onboarding@resend.dev>` |
| `TEAMS_WEBHOOK_URL` | optional | Incoming webhook URL. If unset, Teams cards fall back to console log. |
| `ENTRA_GROUP_ADMIN` / `ENTRA_GROUP_MANAGER` | optional | Comma-separated Azure AD group Object IDs for SSO role mapping. If blank, all SSO sign-ins default to EMPLOYEE. |

Frontend-side:

| Variable | Required | Set to |
|---|---|---|
| `VITE_API_URL` | yes | `/api` (frontend uses the Vite proxy) |
| `BACKEND_URL` | yes | Backend FQDN — Vite proxies `/api/*` to this |
| `HOST` | yes | `0.0.0.0` |
| `PORT` | yes | `8081` |

---

## Cost note

Container Apps on the Consumption plan with `min-replicas 1` runs ~$30-40/month for two small containers. For a hackathon eval window (≤24 hours), real cost is pennies. If keeping the deployment up longer, consider scaling `goalflow-frontend` to `min-replicas 0` (it's stateless) and leaving the backend at 1 for the escalation cron.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `503 No healthy upstream` | Container is still booting. First boot takes ~30s for `npm install` + Prisma generate. |
| Frontend loads but API calls fail with CORS error | `CORS_ORIGIN` doesn't include the deployed frontend FQDN. Set via `az containerapp update`. |
| Login returns 401 but the user exists | Backend's `DATABASE_URL` points at a different Supabase than where you ran the seed. |
| Escalation cron never fires | Backend `min-replicas` is 0. Set to 1 (see step 3). |
| `AADSTS50020` on Microsoft SSO | App registration is single-tenant; user is signing in with a personal Microsoft account. Switch to multi-tenant + personal (see `SETUP-AZURE-SSO.md`). |

---

After this walkthrough, GoalFlow is live on Azure with the same internal-DNS proxy topology, BRD §5.2 email + Teams integrations active, and the hourly escalation cron running.
