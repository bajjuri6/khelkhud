import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import { config } from "./config.js";
import { logger } from "./lib/logger.js";
import { authRouter } from "./routes/auth.js";
import { metaRouter } from "./routes/meta.js";
import { playersRouter } from "./routes/players.js";
import { sponsorsRouter } from "./routes/sponsors.js";
import {
  filesRouter,
  localUploadHandler,
  rawUploadBodyParser,
  uploadsRouter,
} from "./routes/uploads.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";

const app = express();

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

// Raw-body routes (file upload target; Razorpay webhook in Phase 4) must be
// mounted BEFORE express.json().
app.put("/api/uploads/local/:token", rawUploadBodyParser, localUploadHandler);

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ data: { status: "ok", service: "khelkhud-api" } });
});

app.use("/api/auth", authRouter);
app.use("/api/meta", metaRouter);
app.use("/api/players", playersRouter);
app.use("/api/sponsors", sponsorsRouter);
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
