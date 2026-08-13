import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import { config } from "./config.js";
import { logger } from "./lib/logger.js";
import { authRouter } from "./routes/auth.js";
import { metaRouter } from "./routes/meta.js";
import { athletesRouter } from "./routes/athletes.js";
import { sponsorsRouter } from "./routes/sponsors.js";
import { sponsorshipsRouter } from "./routes/sponsorships.js";
import { razorpayWebhookBodyParser, razorpayWebhookHandler } from "./routes/webhooks.js";
import { updatesRouter } from "./routes/updates.js";
import { adminRouter } from "./routes/admin.js";
import { coordinatorsRouter } from "./routes/coordinators.js";
import { institutionsRouter } from "./routes/institutions.js";
import { notificationsRouter } from "./routes/notifications.js";
import {
  filesRouter,
  localUploadHandler,
  rawUploadBodyParser,
  uploadsRouter,
} from "./routes/uploads.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";

const app = express();

// In production Caddy terminates TLS and proxies to this process, so every request
// arrives from the container network and req.ip is the proxy, not the client. Without
// this, the login rate limiter buckets the entire internet under one key — it stops being
// a limiter and becomes a global lockout switch. (The sibling nybr project shipped
// exactly this bug: "rate limiting behind a load balancer is decorative until trust proxy
// is set".)
//
// The value is 1, not `true`: one hop, Caddy. `true` trusts the whole X-Forwarded-For
// chain, which lets a client spoof its own address by sending the header.
app.set("trust proxy", 1);

// cross-origin resource policy relaxed so the web app (different port/origin)
// can embed images served by this API
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: config.WEB_URL, credentials: true }));
app.use(cookieParser());
app.use(
  pinoHttp({
    logger,
    autoLogging: { ignore: (req) => req.url === "/api/health" },
  }),
);

// Raw-body routes must be mounted BEFORE express.json().
app.put("/api/uploads/local/:token", rawUploadBodyParser, localUploadHandler);
app.post("/api/webhooks/razorpay", razorpayWebhookBodyParser, razorpayWebhookHandler);

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ data: { status: "ok", service: "khelkhud-api" } });
});

app.use("/api/auth", authRouter);
app.use("/api/meta", metaRouter);
app.use("/api/athletes", athletesRouter);
app.use("/api/sponsors", sponsorsRouter);
app.use("/api/sponsorships", sponsorshipsRouter);
app.use("/api/updates", updatesRouter);
app.use("/api/admin", adminRouter);
app.use("/api/coordinators", coordinatorsRouter);
app.use("/api/institutions", institutionsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/api/files", filesRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(config.API_PORT, () => {
  logger.info(`khelkhud API listening on ${config.API_URL}`);
  if (!config.payments.enabled) logger.warn("Payments running in STUB mode (no Razorpay keys)");
  if (!config.mail.sesEnabled) logger.warn("Mailer running in CONSOLE mode (no AWS creds)");
  logger.info(`Storage driver: ${config.STORAGE_DRIVER}`);
});
