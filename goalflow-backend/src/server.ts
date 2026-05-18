import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import jwt from "@fastify/jwt";
import cookie from "@fastify/cookie";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { prismaPlugin } from "./plugins/prisma.js";
import { authPlugin } from "./plugins/auth.js";
import { registerRoutes } from "./routes/index.js";
import { startEscalationCron } from "./services/escalation.service.js";
import { startCycleScheduler } from "./services/cycle-transitions.service.js";

const PORT = Number(process.env.PORT ?? 3001);
const isProd = process.env.NODE_ENV === "production";
const isDev = !isProd;

// Fail-fast on required secrets in production
function requireEnv(keys: string[]) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required env vars in production: ${missing.join(", ")}`);
  }
}
if (isProd) requireEnv(["JWT_SECRET", "DATABASE_URL", "CORS_ORIGIN"]);

const origins = (process.env.CORS_ORIGIN ?? "http://localhost:8080").split(",").map((s) => s.trim()).filter(Boolean);
if (isProd && origins.includes("*")) {
  throw new Error("CORS_ORIGIN cannot contain '*' in production");
}

export async function build(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: isDev
      ? { transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } } }
      : true,
    trustProxy: isProd,
    disableRequestLogging: false,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false, // Swagger UI inlines styles; disable CSP for /docs friendliness
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });

  await app.register(rateLimit, {
    global: true,
    max: isProd ? 100 : 1000,
    timeWindow: "1 minute",
    skipOnError: false,
    keyGenerator: (req) => req.ip,
    errorResponseBuilder: (_req, ctx) => ({
      error: "Too many requests",
      retryAfter: ctx.after,
    }),
  });

  await app.register(cors, {
    origin: origins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  });
  await app.register(cookie);
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? "dev-secret-change-me",
    cookie: { cookieName: "token", signed: false },
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "GoalFlow API",
        description: "Atomberg in-house goal setting & tracking portal",
        version: "0.1.0",
      },
      servers: [{ url: `http://localhost:${PORT}` }],
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  await app.register(prismaPlugin);
  await app.register(authPlugin);

  await registerRoutes(app);

  app.get("/health", async () => ({ status: "ok", time: new Date().toISOString() }));

  return app;
}

// Boot only when run as the main module (skipped when imported by tests)
const isMain = import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/").replace(/^.*?(src.*)$/, "$1") ?? "");
if (process.env.NODE_ENV !== "test") {
  build()
    .then(async (app) => {
      await app.listen({ port: PORT, host: "0.0.0.0" });
      app.log.info(`GoalFlow API listening on http://localhost:${PORT}`);
      app.log.info(`OpenAPI docs at http://localhost:${PORT}/docs`);
      startEscalationCron(app);
      startCycleScheduler(app);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
