import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import { config } from "./config.js";
import { logger } from "./lib/logger.js";
import { authRouter } from "./routes/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";

const app = express();

app.use(helmet());
app.use(cors({ origin: config.WEB_URL, credentials: true }));
app.use(cookieParser());
app.use(
  pinoHttp({
    logger,
    autoLogging: { ignore: (req) => req.url === "/api/health" },
  }),
);

// NOTE: the Razorpay webhook route (raw body) must be mounted BEFORE express.json()
// when it lands in Phase 4.
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ data: { status: "ok", service: "khelkhud-api" } });
});

app.use("/api/auth", authRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(config.API_PORT, () => {
  logger.info(`khelkhud API listening on ${config.API_URL}`);
  if (!config.payments.enabled) logger.warn("Payments running in STUB mode (no Razorpay keys)");
  if (!config.mail.sesEnabled) logger.warn("Mailer running in CONSOLE mode (no AWS creds)");
  logger.info(`Storage driver: ${config.STORAGE_DRIVER}`);
});
