# ─── GoalFlow — production build, single image ──────────────────────────────
# Builds TypeScript backend → dist/, builds frontend → dist/client + dist/server,
# then runs both with `node` (no `vite dev` / `tsx watch` overhead). Vite dev
# was the cause of multi-second navigations on Azure App Service — this image
# replaces both processes with optimised production servers.

FROM node:22-alpine

# Prisma's query engine needs OpenSSL + glibc compat on Alpine
RUN apk add --no-cache openssl libc6-compat

# ─── Backend: deps + Prisma client + tsc build ──────────────────────────────
WORKDIR /app/goalflow-backend
COPY goalflow-backend/package.json goalflow-backend/package-lock.json ./
RUN npm install --no-audit --no-fund

COPY goalflow-backend/ ./
RUN npx prisma generate
RUN npm run build   # tsc → dist/src/server.js + dist/prisma/*

# ─── Frontend: deps + vite build (Node SSR, not Cloudflare Worker) ──────────
WORKDIR /app/goalflow-atomberg-hub
COPY goalflow-atomberg-hub/package.json goalflow-atomberg-hub/package-lock.json ./
RUN npm install --no-audit --no-fund

COPY goalflow-atomberg-hub/ ./
RUN npm run build   # vite build → dist/server/server.js + dist/client/*

# ─── Process orchestrator ───────────────────────────────────────────────────
RUN npm install -g concurrently@9.2.1

WORKDIR /app
EXPOSE 3001 8081

# ─── Baked-in env values (TESTING ONLY — rotate before production) ──────────
# NODE_ENV=production unlocks Fastify + React + Vite optimisations.
# Supabase Postgres
ENV DATABASE_URL="postgresql://postgres.sgzboygiqtegxuhhdhmz:1B7DCZlzAYOm702b@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=10&pool_timeout=20"
ENV DIRECT_URL="postgresql://postgres.sgzboygiqtegxuhhdhmz:1B7DCZlzAYOm702b@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres"
ENV SUPABASE_URL="https://sgzboygiqtegxuhhdhmz.supabase.co"
ENV SUPABASE_PUBLISHABLE_KEY="sb_publishable_mekni0RsCLI5S276IuxP3g_ypbDAgRI"
# App config
ENV APP_URL="https://atomberg-atomquest-hackathon-cuhxamechhgje5ha.eastasia-01.azurewebsites.net"
ENV JWT_SECRET="ZmZkMmJjMzg1Nzg2NDA5MWE5ZWE1OWY1MTk2OWMwYjQ4ZDQ4ZmI5YQ"
ENV NODE_ENV="production"
ENV CORS_ORIGIN="https://atomberg-atomquest-hackathon-cuhxamechhgje5ha.eastasia-01.azurewebsites.net,http://localhost:8081,http://localhost:3000"
# Integrations (BRD §5.2)
ENV RESEND_API_KEY="re_dhpcBWJr_KaagC6UjPga2h5rM8geuq5pj"
ENV EMAIL_FROM="GoalFlow <onboarding@resend.dev>"
ENV TEAMS_WEBHOOK_URL=""
ENV SMTP_HOST=""
ENV SMTP_PORT="587"
ENV SMTP_USER=""
ENV SMTP_PASS=""
ENV SMTP_FROM="noreply@goalflow.atomberg.local"
# Entra ID (BRD §5.1)
ENV ENTRA_TENANT="atomberg.onmicrosoft.com"
ENV ENTRA_GROUP_ADMIN=""
ENV ENTRA_GROUP_MANAGER=""
# Frontend (Vite + SSR adapter)
ENV VITE_API_URL="/api"
ENV BACKEND_URL="http://localhost:3001"
ENV HOST="0.0.0.0"

# Run production servers via concurrently. -k kills siblings on any exit so
# docker stop doesn't leave a half-up state. PORT is set per-process inline.
CMD ["sh", "-c", "concurrently -k -n BE,FE -c cyan,magenta 'cd /app/goalflow-backend && PORT=3001 node dist/src/server.js' 'cd /app/goalflow-atomberg-hub && PORT=8081 HOST=0.0.0.0 node server.node.mjs'"]
