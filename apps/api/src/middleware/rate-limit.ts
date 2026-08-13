import type { NextFunction, Request, Response } from "express";
import { ApiError } from "./errors.js";

/**
 * A small fixed-window rate limiter, in process memory.
 *
 * Scope, honestly stated: this is single-instance only. The stack runs exactly one API
 * container on one VM (devops/DEPLOYMENT_WORKFLOW.md), so an in-memory counter is the
 * whole population. The moment a second replica exists this becomes decorative and needs
 * to move to Redis or Postgres — that is a real cliff, not a theoretical one.
 *
 * It exists because `passwordSchema` sets a 10-character minimum with no composition
 * rules. That is the right call, but it is only safe if online guessing is throttled;
 * length requests do nothing against an attacker making thousands of attempts.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Unbounded growth would be a slow memory leak driven by attacker-chosen keys, so expired
// entries are swept periodically. unref() so this timer never holds the process open.
const SWEEP_MS = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, SWEEP_MS).unref();

export function rateLimit(opts: {
  /** Requests allowed per window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Namespace, so two limiters never share a bucket. */
  name: string;
  /**
   * Extra key material beyond the IP — e.g. the submitted email, so one attacker cannot
   * lock out an entire office NAT by hammering a single account, and cannot dodge the
   * limit by rotating the address they attack from.
   */
  keyOn?: (req: Request) => string;
}) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // req.ip is only trustworthy once Express is told about the proxy. Caddy sets
    // X-Forwarded-For and index.ts enables `trust proxy`; without that every request
    // shares one bucket and the limiter becomes a global outage switch.
    const ip = req.ip ?? "unknown";
    const extra = opts.keyOn?.(req) ?? "";
    const key = `${opts.name}:${ip}:${extra}`;

    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > opts.max) {
      const seconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      next(
        new ApiError(
          429,
          "RATE_LIMITED",
          `Too many attempts. Try again in ${seconds} second${seconds === 1 ? "" : "s"}.`,
        ),
      );
      return;
    }
    next();
  };
}

/** Exposed for tests; also lets a dev reset a self-inflicted lockout. */
export function resetRateLimits(): void {
  buckets.clear();
}
